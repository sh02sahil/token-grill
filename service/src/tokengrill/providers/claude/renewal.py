"""Let Claude Code own token rotation, locking, and credential writes."""

import asyncio
import contextlib
import os
from pathlib import Path
from time import monotonic

from tokengrill.core.errors import ServiceError
from tokengrill.core.json_util import record_at, string_at
from tokengrill.core.paths import provider_paths
from tokengrill.core.types import ProviderInstance
from tokengrill.providers.base import CollectorContext
from tokengrill.providers.claude.auth import load_claude_access_token
from tokengrill.providers.credentials import read_credential_json

RENEWAL_TIMEOUT_SECONDS = 30
RETRY_SECONDS = 300
MAX_RETRY_SECONDS = 3600


class ClaudeTokenLoader:
    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._retry_after: dict[str, float] = {}
        # A file whose renewal keeps failing is tried less often; a success starts over.
        self._waits: dict[str, float] = {}

    async def load(self, instance: ProviderInstance, ctx: CollectorContext) -> str:
        if not ctx.claude_renewal:
            return await load_claude_access_token(instance)
        path = Path(provider_paths(instance)["authFile"])
        # Two account homes can reach one file through a link; the key is the file itself.
        key = str(await asyncio.to_thread(path.resolve))
        # Accounts can share a credentials file. A waiter must reread it after renewal.
        async with self._locks.setdefault(key, asyncio.Lock()):
            try:
                return await load_claude_access_token(instance)
            except ServiceError as error:
                if error.code != "auth-expired" or instance["app"] != "claude-code":
                    raise
                now = monotonic()
                self._retry_after = {file: due for file, due in self._retry_after.items() if due > now}
                # The CLI has no option for an arbitrarily named credentials file.
                if path.name != ".credentials.json" or key in self._retry_after:
                    raise
                oauth = record_at(await read_credential_json(str(path)), "claudeAiOauth")
                if not oauth or not string_at(oauth, "refreshToken"):
                    raise
                wait = self._waits.get(key, RETRY_SECONDS)
                self._retry_after[key] = now + wait
            result = await _run_cli(path.parent)
            ctx.record("sign-in", result)
            try:
                # auth status may exit zero even when its startup refresh failed.
                token = await load_claude_access_token(instance)
            except ServiceError:
                self._waits[key] = min(wait * 2, MAX_RETRY_SECONDS)
                raise
            self._waits.pop(key, None)
            self._retry_after[key] = now + RETRY_SECONDS
            return token


async def _run_cli(home: Path) -> str:
    # Inherited provider overrides can select a different login than this account.
    env = {key: value for key, value in os.environ.items() if not key.startswith(("CLAUDE_", "ANTHROPIC_"))}
    env.update(
        CLAUDE_CONFIG_DIR=str(home),
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1",
        DISABLE_AUTOUPDATER="1",
        DISABLE_TELEMETRY="1",
        DISABLE_ERROR_REPORTING="1",
    )
    # D-Bus activation can omit the native Claude install directory from PATH.
    env["PATH"] = os.pathsep.join([*os.get_exec_path(), str(Path.home() / ".local" / "bin")])
    try:
        process = await asyncio.create_subprocess_exec(
            "claude",
            "auth",
            "status",
            cwd="/",
            env=env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except OSError:
        return "Claude CLI could not start"
    try:
        async with asyncio.timeout(RENEWAL_TIMEOUT_SECONDS):
            code = await process.wait()
        return f"Claude CLI exited with status {code}"
    except TimeoutError:
        return "Claude CLI timed out"
    finally:
        if process.returncode is None:
            # The child can exit between the returncode check and the signal.
            with contextlib.suppress(ProcessLookupError):
                process.kill()
        await process.wait()
