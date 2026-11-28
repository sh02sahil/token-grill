"""Let the Codex CLI renew its own expired sign-in.

The refresh token is single-use, so only Codex may spend it: a refresh by Token Grill would leave the CLI
with a used token. The Codex app server (`codex app-server`) refreshes and saves the sign-in itself when a
client reads the account with `refreshToken`, without a prompt and without opening a conversation.
"""

import asyncio
from pathlib import Path
from time import monotonic

from tokengrill import __version__
from tokengrill.core.errors import ServiceError
from tokengrill.core.json_util import record_at, string_at
from tokengrill.core.paths import provider_paths
from tokengrill.core.types import ProviderInstance
from tokengrill.providers.base import CollectorContext
from tokengrill.providers.codex.auth import load_codex_access_token
from tokengrill.providers.credentials import read_credential_json
from tokengrill.providers.stdio_rpc import cli_environment, started

RENEWAL_TIMEOUT_SECONDS = 30
RETRY_SECONDS = 300
MAX_RETRY_SECONDS = 3600


class CodexTokenLoader:
    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._retry_after: dict[str, float] = {}
        # A file whose renewal keeps failing is tried less often; a success starts over.
        self._waits: dict[str, float] = {}

    async def load(self, instance: ProviderInstance, ctx: CollectorContext) -> str:
        if not instance["renewSignIn"]:
            return await load_codex_access_token(instance)
        path = Path(provider_paths(instance)["authFile"])
        # Two account homes can reach one file through a link; the key is the file itself.
        key = str(await asyncio.to_thread(path.resolve))
        # Accounts can share an auth file. A waiter must reread it after renewal.
        async with self._locks.setdefault(key, asyncio.Lock()):
            try:
                return await load_codex_access_token(instance)
            except ServiceError as error:
                if error.code != "auth-expired" or instance["app"] != "codex-cli":
                    raise
                now = monotonic()
                self._retry_after = {file: due for file, due in self._retry_after.items() if due > now}
                # CODEX_HOME names a folder; Codex keeps its sign-in there as auth.json.
                if path.name != "auth.json" or key in self._retry_after:
                    raise
                tokens = record_at(await read_credential_json(str(path)), "tokens")
                if not tokens or not string_at(tokens, "refresh_token"):
                    raise
                wait = self._waits.get(key, RETRY_SECONDS)
                self._retry_after[key] = now + wait
            ctx.record("sign-in", await _run_app_server(path.parent))
            try:
                # The reply can be a success even when the refresh failed; the file tells.
                token = await load_codex_access_token(instance)
            except ServiceError:
                self._waits[key] = min(wait * 2, MAX_RETRY_SECONDS)
                raise
            self._waits.pop(key, None)
            self._retry_after[key] = now + RETRY_SECONDS
            return token


async def _run_app_server(home: Path) -> str:
    # Inherited overrides can select a different sign-in than this account's.
    env = cli_environment(drop=("OPENAI_API_KEY", "CODEX_API_KEY"), CODEX_HOME=str(home))
    try:
        async with started(("codex", "app-server"), env) as codex, asyncio.timeout(RENEWAL_TIMEOUT_SECONDS):
            if not await codex.request(1, "initialize", {"clientInfo": {"name": "tokengrill", "version": __version__}}):
                return "Codex did not initialize"
            await codex.notify("initialized")
            renewed = await codex.request(2, "account/read", {"refreshToken": True})
            return "Codex read its account" if renewed else "Codex could not read its account"
    except TimeoutError:
        return "Codex timed out"
    except (BrokenPipeError, ConnectionResetError):
        return "Codex exited early"
    except OSError:
        return "Codex could not start"
