"""Values from a service response or another tool's file stay inside what a reading can hold."""

import json
import math

import pytest

from tokengrill.core.json_util import count_at, parse_record, to_epoch_ms
from tokengrill.core.limits import MAX_EPOCH_MS, MAX_LISTED, MAX_RESET_CREDITS
from tokengrill.core.pace import pace_lead, runs_out_at
from tokengrill.dbus.payloads import parse_json_arg, wire_json
from tokengrill.providers.claude.history import claude_usage_event
from tokengrill.providers.claude.normalize import normalize_claude_usage
from tokengrill.providers.codex.normalize import normalize_codex_usage
from tokengrill.providers.codex.reset_credits import normalize_reset_credits
from tokengrill.providers.kimi.normalize import normalize_kimi_usage
from tokengrill.providers.windows import window_seconds
from tokengrill.statusview import render_status

NOW = 1_800_000_000_000


@pytest.mark.parametrize("value", [-(10**306), 1.7e308, -1, 10**17, "9999999-01-01", "0001-01-01T00:00:00Z"])
def test_a_time_outside_the_calendar_is_no_time(value: object) -> None:
    assert to_epoch_ms(value) is None


def test_times_inside_the_calendar_keep_their_value() -> None:
    assert to_epoch_ms(1_800_000_000) == 1_800_000_000_000
    assert to_epoch_ms(MAX_EPOCH_MS) == MAX_EPOCH_MS
    assert to_epoch_ms("2030-01-01T00:00:00Z") == 1_893_456_000_000


@pytest.mark.parametrize("value", [None, 0, 0.5, -3, 366 * 86400 + 1, 1.19e306])
def test_an_implausible_window_length_is_unknown(value: float | None) -> None:
    assert window_seconds(value) is None


def test_a_plausible_window_length_is_kept() -> None:
    assert window_seconds(18000) == 18000
    assert window_seconds(1) == 1


def test_a_record_nested_past_the_parser_stack_is_skipped() -> None:
    depth = 200_000
    assert parse_record('{"a":' + "[" * depth + "]" * depth + "}") is None


def test_token_counts() -> None:
    assert count_at({"n": 5}, "n") == 5
    assert count_at({}, "n") == 0
    assert count_at({"n": None}, "n") == 0
    assert count_at({"n": "7"}, "n") == 0
    assert count_at({"n": -1}, "n") is None
    assert count_at({"n": 1e308}, "n") is None


def _claude_line(**usage: object) -> str:
    message = {"model": "claude-sonnet-4-5", "usage": {"input_tokens": 10, "output_tokens": 5, **usage}}
    return json.dumps({"timestamp": "2030-01-01T00:00:00Z", "message": message})


def test_a_claude_line_with_an_impossible_count_is_skipped() -> None:
    assert claude_usage_event(_claude_line(cache_creation_input_tokens=1e308)) is None
    event = claude_usage_event(_claude_line(cache_creation_input_tokens=None))
    assert event is not None
    assert event["totals"]["cacheWrite"] == 0


def test_pace_of_extreme_numbers_is_no_pace() -> None:
    window = {"percent": 1, "resetAt": int(1.7e308), "durationSeconds": int(1.19e306)}
    assert pace_lead(window, NOW) is None  # type: ignore[arg-type]
    assert runs_out_at(window, NOW) is None  # type: ignore[arg-type]
    zero = {"percent": 0.5, "resetAt": NOW + 1000, "durationSeconds": 0}
    assert pace_lead(zero, NOW) is None  # type: ignore[arg-type]
    assert runs_out_at(zero, NOW) is None  # type: ignore[arg-type]


def test_a_codex_window_with_extreme_numbers_has_no_reset_or_length() -> None:
    payload = {
        "rate_limit": {"primary_window": {"used_percent": 100, "limit_window_seconds": 1.19e306, "reset_at": 1.7e308}}
    }
    (window,) = normalize_codex_usage(payload)["windows"]
    assert window["resetAt"] is None
    assert window["durationSeconds"] is None


def test_reset_credits_are_listed_up_to_the_limit_and_the_count_stays_plausible() -> None:
    summary = normalize_reset_credits({"credits": [{}] * 1000, "available_count": 1e20}, fetched_at=NOW)
    assert summary is not None
    assert len(summary["credits"]) == MAX_LISTED
    assert summary["availableCount"] == 1000
    kept = normalize_reset_credits({"credits": [{}] * 3, "available_count": 7}, fetched_at=NOW)
    assert kept is not None
    assert kept["availableCount"] == 7
    huge = normalize_reset_credits({"credits": [{}] * (MAX_RESET_CREDITS + 5)}, fetched_at=NOW)
    assert huge is not None
    assert huge["availableCount"] == MAX_RESET_CREDITS


def test_long_lists_of_limits_are_cut() -> None:
    scoped = [{"percent": 0.1, "group": "session", "scope": {"surface": f"s{i}"}} for i in range(100)]
    # One scoped limit fills the session window; the scoped ones after it are cut to the limit.
    assert len(normalize_claude_usage({"limits": scoped})) == MAX_LISTED + 1
    extra = [
        {"limit_name": f"m{i}", "rate_limit": {"primary_window": {"used_percent": 1, "limit_window_seconds": 18000}}}
        for i in range(100)
    ]
    assert len(normalize_codex_usage({"additional_rate_limits": extra})["windows"]) == MAX_LISTED
    limits = [{"name": f"l{i}", "detail": {"limit": 100, "used": 1}} for i in range(100)]
    assert len(normalize_kimi_usage({"limits": limits})) == MAX_LISTED


def test_the_wire_text_is_json_that_any_parser_reads() -> None:
    text = wire_json({"schema": 1, "monthCost": math.inf, "nan": math.nan, "big": 10**310})
    assert json.loads(text, parse_constant=lambda name: pytest.fail(name)) == {
        "schema": 1,
        "monthCost": None,
        "nan": None,
        "big": 10**310,
    }


@pytest.mark.parametrize("text", ['{"lowBalance": NaN}', '{"lowBalance": Infinity}', "-Infinity"])
def test_a_d_bus_argument_with_a_non_finite_constant_is_refused(text: str) -> None:
    with pytest.raises(Exception, match="not valid JSON"):
        parse_json_arg(text)


def test_status_prints_no_control_character_from_a_label() -> None:
    label = "\x1b]0;title\x07\x1b[2J" + chr(0x202E) + "Weekly\x9b"
    state = {
        "paused": False,
        "accounts": [{"id": "a", "kind": "kimi", "displayName": "K\x1b[31m", "enabled": True}],
        "snapshots": {
            "a": {
                "windows": [{"label": label, "percent": 0.5, "resetAt": None}],
                "balance": None,
                "errorInfo": None,
                "lastUpdated": NOW,
            }
        },
    }
    text = render_status(state, NOW)  # type: ignore[arg-type]
    assert all(ord(char) >= 0x20 or char == "\n" for char in text)
    assert chr(0x202E) not in text
    assert "\x9b" not in text
    assert "Weekly" in text
