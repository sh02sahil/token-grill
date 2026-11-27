"""The plain-text account overview printed by `tokengrill status`."""

import re
import unicodedata
from typing import Final

from tokengrill.core.messages import MESSAGES
from tokengrill.core.timemath import duration_until, format_duration
from tokengrill.core.types import ErrorInfo, ProviderKind, ServiceState

_SERVICE_LABELS: Final[dict[ProviderKind, str]] = {
    "codex": "Codex",
    "claude": "Claude",
    "kiro": "Kiro",
    "antigravity": "Antigravity",
    "copilot": "GitHub Copilot",
    "opencode-go": "OpenCode Go",
    "deepseek": "DeepSeek",
    "kimi": "Kimi Code",
    "cursor": "Cursor",
}
_PLACEHOLDER: Final = re.compile(r"\{(\w+)\}")


def _plain(text: str) -> str:
    """Labels and names can come from a service response or another tool's files. Printed as they are, an
    escape sequence would reach the terminal as a command: a new title, a cleared screen or a link. Every
    control and format character, which includes the bidirectional overrides, is printed as '?'."""
    return "".join("?" if unicodedata.category(char).startswith("C") else char for char in text)


def error_text(error: ErrorInfo) -> str:
    """English text of an error; a missing parameter stays as written, an unknown id falls back to its code."""
    template = MESSAGES.get(error["messageId"])
    if template is None:
        return error["code"]
    params = error["params"]
    return _PLACEHOLDER.sub(lambda found: params.get(found.group(1), found.group(0)), template)


def _duration(milliseconds: float, now: int) -> str:
    parts = duration_until(milliseconds, now)
    assert parts is not None
    return format_duration(parts)


def render_status(state: ServiceState, now: int) -> str:
    """`now` is in milliseconds, like every time in the payloads."""
    lines: list[str] = []
    if state["paused"]:
        lines.append("Refreshing is paused.")
    if not state["accounts"]:
        lines.append("No accounts are set up.")
    for account in state["accounts"]:
        if lines:
            lines.append("")
        service = _SERVICE_LABELS.get(account["kind"], account["kind"])
        lines.append(f"{_plain(service)} - {_plain(account['displayName'])}")
        snapshot = state["snapshots"].get(account["id"])
        if not account["enabled"]:
            lines.append("  Disabled")
            continue
        if snapshot is None:
            lines.append("  No reading yet")
            continue
        for window in snapshot["windows"]:
            if window["percent"] is None:
                lines.append(f"  {_plain(window['label'])}: unknown")
                continue
            # percent is the used fraction (0 to 1), as in the snapshots of 0.4.1.
            left = round(100.0 * min(1.0, max(0.0, 1.0 - window["percent"])))
            text = f"  {_plain(window['label'])}: {left}% left"
            if window["resetAt"] is not None:
                text += f", resets in {_duration(window['resetAt'], now)}"
            lines.append(text)
        balance = snapshot["balance"]
        if balance is not None:
            lines.append(f"  Balance: {balance['amount']:.2f} {_plain(balance['currency'])}")
        if snapshot["errorInfo"] is not None:
            lines.append(f"  Error: {_plain(error_text(snapshot['errorInfo']))}")
        updated = snapshot["lastUpdated"]
        if updated is None:
            lines.append("  not updated yet")
        else:
            lines.append(f"  updated {_duration(now + (now - updated), now)} ago")
    return "\n".join(lines) + "\n"
