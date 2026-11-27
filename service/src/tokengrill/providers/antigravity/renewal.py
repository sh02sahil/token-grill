"""Let agy renew its own expired keyring sign-in.

The agy CLI keeps a Google OAuth token in the keyring but no OAuth client that Token Grill could use, so
only agy can renew it. Its Agent Client Protocol server (`agy acp`) renews and saves the token when a client
authenticates, without a prompt and without opening a conversation.
"""

import asyncio
from time import monotonic

from tokengrill.providers.stdio_rpc import cli_environment, started

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
    return cli_environment(drop=("DISPLAY", "WAYLAND_DISPLAY"), BROWSER="true")


async def _run_acp(method_id: str) -> str:
    try:
        async with started(("agy", "acp"), _environment()) as agy, asyncio.timeout(RENEWAL_TIMEOUT_SECONDS):
            if not await agy.request(1, "initialize", {"protocolVersion": 1, "clientCapabilities": {}}):
                return "agy did not initialize"
            renewed = await agy.request(2, "authenticate", {"methodId": method_id})
            return "agy renewed its sign-in" if renewed else "agy could not renew its sign-in"
    except TimeoutError:
        return "agy timed out"
    except (BrokenPipeError, ConnectionResetError):
        return "agy exited early"
    except OSError:
        return "agy could not start"
