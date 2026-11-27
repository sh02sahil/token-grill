"""JSON-RPC over the standard streams of a CLI that the service starts to renew that CLI's own sign-in."""

import asyncio
import contextlib
import json
import os
from collections.abc import AsyncIterator, Mapping, Sequence
from pathlib import Path


class StdioPeer:
    def __init__(self, process: asyncio.subprocess.Process) -> None:
        assert process.stdin is not None and process.stdout is not None
        self._stdin = process.stdin
        self._stdout = process.stdout

    async def notify(self, method: str) -> None:
        await self._send({"jsonrpc": "2.0", "method": method})

    async def request(self, request_id: int, method: str, params: Mapping[str, object]) -> bool:
        """True when the CLI answers without an error. Notifications before the reply are skipped."""
        await self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
        while line := await self._stdout.readline():
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if isinstance(message, dict) and message.get("id") == request_id:
                return "error" not in message
        return False

    async def _send(self, message: Mapping[str, object]) -> None:
        self._stdin.write((json.dumps(message) + "\n").encode())
        await self._stdin.drain()


def cli_environment(drop: Sequence[str] = (), **extra: str) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if key not in drop}
    env.update(extra)
    # D-Bus activation can omit the directory that these CLIs install themselves into.
    env["PATH"] = os.pathsep.join([*os.get_exec_path(), str(Path.home() / ".local" / "bin")])
    return env


@contextlib.asynccontextmanager
async def started(argv: Sequence[str], env: Mapping[str, str]) -> AsyncIterator[StdioPeer]:
    """Starts the CLI and kills it on exit. Raises OSError when it cannot start."""
    process = await asyncio.create_subprocess_exec(
        *argv,
        cwd="/",
        env=dict(env),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        yield StdioPeer(process)
    finally:
        if process.returncode is None:
            # The child can exit between the returncode check and the signal.
            with contextlib.suppress(ProcessLookupError):
                process.kill()
        await process.wait()
