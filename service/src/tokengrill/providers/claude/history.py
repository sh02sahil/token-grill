"""The Claude Code session log line that carries the usage of one assistant message."""

from tokengrill.core.json_util import count_at, parse_record, record_at, string_at, to_epoch_ms
from tokengrill.core.types import UsageEvent

_COUNTS = ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")


def claude_usage_event(line: str) -> UsageEvent | None:
    """Claude Code writes one JSON record per line; only assistant messages carry usage."""
    # Most lines carry no usage, so they are skipped before the costlier JSON parse.
    if '"usage"' not in line:
        return None
    record = parse_record(line)
    if not record:
        return None
    message = record_at(record, "message")
    usage = record_at(message, "usage") if message else None
    captured_at = to_epoch_ms(string_at(record, "timestamp"))
    if not message or not usage or captured_at is None:
        return None
    counts = [count_at(usage, key) for key in _COUNTS]
    if None in counts:
        return None
    input_tokens, output_tokens, cached, written = (count or 0 for count in counts)
    total = input_tokens + output_tokens
    if not total:
        return None
    return {
        "capturedAt": int(captured_at),
        "model": string_at(message, "model"),
        "totals": {
            "input": input_tokens,
            "output": output_tokens,
            "cachedInput": cached,
            "cacheWrite": written,
            "reasoning": 0,
            "total": total,
        },
    }
