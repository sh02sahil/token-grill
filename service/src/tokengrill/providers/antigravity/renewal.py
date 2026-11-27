"""Let agy renew its own expired keyring sign-in.

The agy CLI keeps a Google OAuth token in the keyring but no OAuth client that Token Grill could use, so
only agy can renew it. Its Agent Client Protocol server (`agy acp`) renews and saves the token when a client
authenticates, without a prompt and without opening a conversation.
"""

import asyncio
import contextlib
import json
import os
from pathlib import Path
from time import monotonic

RENEWAL_TIMEOUT_SECONDS = 30
RETRY_SECONDS = 300
MAX_RETRY_SECONDS = 3600

# agy's sign-in kind in the keyring item, and the ACP sign-in method that renews it. Only these are known.
_METHODS = {"consumer": "oauth-personal"}


class AgyRenewal:
    """One renewal at a time; a failure makes the next attempt wait longer, and a success starts over."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._retry_after = 0.0
        self._wait = float(RETRY_SECONDS)

    def can_renew(self, auth_method: str | None) -> bool:
        return auth_method in _METHODS and monotonic() >= self._retry_after

    async def renew(self, auth_method: str) -> str:
        """Runs agy once and returns a line for the diagnostics. The caller reads the keyring again."""
        async with self._lock:
            now = monotonic()
            if now < self._retry_after:
                return "agy renewal waits after a failure"
            self._retry_after = now + self._wait
            return await _run_acp(_METHODS[auth_method])

    def succeeded(self) -> None:
        self._wait = float(RETRY_SECONDS)
        self._retry_after = monotonic() + RETRY_SECONDS

    def failed(self) -> None:
        self._wait = min(self._wait * 2, MAX_RETRY_SECONDS)


def _environment() -> dict[str, str]:
    # Without a display and with a browser that does nothing, a sign-in that cannot be renewed fails
    # instead of opening a browser window the user did not ask for.
    env = {key: value for key, value in os.environ.items() if key not in ("DISPLAY", "WAYLAND_DISPLAY")}
    env["BROWSER"] = "true"
    # D-Bus activation can omit the directory that agy installs itself into.
    env["PATH"] = os.pathsep.join([*os.get_exec_path(), str(Path.home() / ".local" / "bin")])
    return env


def _request(request_id: int, method: str, params: dict[str, object]) -> bytes:
    return (json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}) + "\n").encode()


async def _reply(stream: asyncio.StreamReader, request_id: int) -> bool:
    """True when agy answers the request without an error. Notifications before the reply are skipped."""
    while line := await stream.readline():
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if isinstance(message, dict) and message.get("id") == request_id:
            return "error" not in message
    return False


async def _run_acp(method_id: str) -> str:
    try:
        process = await asyncio.create_subprocess_exec(
            "agy",
            "acp",
            cwd="/",
            env=_environment(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except OSError:
        return "agy could not start"
    assert process.stdin is not None and process.stdout is not None
    try:
        async with asyncio.timeout(RENEWAL_TIMEOUT_SECONDS):
            process.stdin.write(_request(1, "initialize", {"protocolVersion": 1, "clientCapabilities": {}}))
            await process.stdin.drain()
            if not await _reply(process.stdout, 1):
                return "agy did not initialize"
            process.stdin.write(_request(2, "authenticate", {"methodId": method_id}))
            await process.stdin.drain()
            return "agy renewed its sign-in" if await _reply(process.stdout, 2) else "agy could not renew its sign-in"
    except TimeoutError:
        return "agy timed out"
    except (BrokenPipeError, ConnectionResetError):
        return "agy exited early"
    finally:
        if process.returncode is None:
            # The child can exit between the returncode check and the signal.
            with contextlib.suppress(ProcessLookupError):
                process.kill()
        await process.wait()
