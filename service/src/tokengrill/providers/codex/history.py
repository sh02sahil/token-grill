"""The Codex session log line that carries the usage of one model turn."""

from tokengrill.core.json_util import count_at, parse_record, record_at, string_at, to_epoch_ms
from tokengrill.core.types import UsageEvent

_COUNTS = ("input_tokens", "output_tokens", "cached_input_tokens", "reasoning_output_tokens")


def codex_usage_event(line: str) -> UsageEvent | None:
    """Codex records each turn in a `token_count` event. It names no model, so these totals are not priced."""
    # Most lines are messages and tool calls, so they are skipped before the costlier JSON parse.
    if '"token_count"' not in line:
        return None
    record = parse_record(line)
    payload = record_at(record, "payload") if record else None
    if not record or record.get("type") != "event_msg" or not payload or payload.get("type") != "token_count":
        return None
    info = record_at(payload, "info")
    usage = record_at(info, "last_token_usage") if info else None
    captured_at = to_epoch_ms(string_at(record, "timestamp"))
    if not usage or captured_at is None:
        return None
    counts = [count_at(usage, key) for key in _COUNTS]
    if None in counts:
        return None
    input_tokens, output_tokens, cached, reasoning = (count or 0 for count in counts)
    reported = usage.get("total_tokens")
    total = count_at(usage, "total_tokens") if isinstance(reported, int | float) else input_tokens + output_tokens
    if total is None:
        return None
    if not total:
        return None
    return {
        "capturedAt": int(captured_at),
        "model": None,
        "totals": {
            "input": input_tokens,
            "output": output_tokens,
            "cachedInput": cached,
            "cacheWrite": 0,
            "reasoning": reasoning,
            "total": total,
        },
    }
