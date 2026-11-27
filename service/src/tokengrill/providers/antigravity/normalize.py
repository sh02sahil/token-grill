"""The cloudcode-pa responses as plan and usage windows."""

from typing import Any, TypedDict

from tokengrill.core.json_util import clamp_fraction, is_record, number_at, record_at, string_at, to_epoch_ms
from tokengrill.core.limits import MAX_LISTED
from tokengrill.core.types import CanonicalQuotaWindow, UsageWindow
from tokengrill.providers.windows import named_length, window_label


class QuotaSummaryBucket(TypedDict):
    canonicalWindow: CanonicalQuotaWindow
    remainingFraction: float
    resetAt: int | None


_BUCKET_WINDOWS: dict[str, CanonicalQuotaWindow] = {"5h": "five-hour", "weekly": "weekly"}


def antigravity_plan(payload: object) -> str | None:
    """The subscription tier from a loadCodeAssist response."""
    tier = record_at(payload, "currentTier") if is_record(payload) else None
    return string_at(tier, "name") if tier else None


def _model_window(bucket: dict[str, Any]) -> UsageWindow | None:
    """A summary may have one "All Models" group with a bucket for each model and no `window`: the group
    says that each bucket shows whichever of its pool's five-hour and weekly caps is closest. The window
    is not named, so the bucket is a limit of its own, with no length and so no pace."""
    bucket_id = string_at(bucket, "bucketId")
    remaining = number_at(bucket, "remainingFraction")
    if bucket_id is None or remaining is None:
        return None
    reset = to_epoch_ms(bucket.get("resetTime"))
    return {
        "id": f"model:{bucket_id}",
        "canonicalWindow": "other",
        "label": string_at(bucket, "displayName") or bucket_id,
        "used": None,
        "limit": None,
        "percent": 1 - clamp_fraction(remaining),
        "resetAt": None if reset is None else int(reset),
        "durationSeconds": None,
        "unit": None,
        "pace": None,
    }


def _buckets(payload: object) -> list[dict[str, Any]]:
    groups = payload.get("groups") if is_record(payload) else None
    found: list[dict[str, Any]] = []
    for group in groups if isinstance(groups, list) else []:
        items: Any = group.get("buckets") if is_record(group) else None
        found.extend(bucket for bucket in (items if isinstance(items, list) else []) if is_record(bucket))
    return found


def extract_quota_summary_buckets(payload: object) -> list[QuotaSummaryBucket]:
    """retrieveUserQuotaSummary groups models (Gemini, Claude and GPT) and gives each group its own
    five-hour and weekly bucket."""
    buckets: list[QuotaSummaryBucket] = []
    for bucket in _buckets(payload):
        canonical = _BUCKET_WINDOWS.get(string_at(bucket, "window") or "")
        remaining = number_at(bucket, "remainingFraction")
        reset = to_epoch_ms(bucket.get("resetTime"))
        if canonical and remaining is not None:
            buckets.append(
                {
                    "canonicalWindow": canonical,
                    "remainingFraction": clamp_fraction(remaining),
                    "resetAt": None if reset is None else int(reset),
                }
            )
    return buckets


def _tighter(a: QuotaSummaryBucket, b: QuotaSummaryBucket) -> QuotaSummaryBucket:
    """The tightest bucket decides what the user can do next, so the lowest remaining fraction wins;
    ties go to the earliest reset."""
    if a["remainingFraction"] != b["remainingFraction"]:
        return a if a["remainingFraction"] < b["remainingFraction"] else b
    b_reset = b["resetAt"]
    a_reset = a["resetAt"]
    if b_reset is not None and (a_reset is None or b_reset < a_reset):
        return b
    return a


def normalize_quota_summary(payload: object) -> list[UsageWindow]:
    tightest: dict[CanonicalQuotaWindow, QuotaSummaryBucket] = {}
    for bucket in extract_quota_summary_buckets(payload):
        current = tightest.get(bucket["canonicalWindow"])
        tightest[bucket["canonicalWindow"]] = _tighter(current, bucket) if current else bucket
    named: list[UsageWindow] = [
        {
            "id": bucket["canonicalWindow"],
            "canonicalWindow": bucket["canonicalWindow"],
            "label": window_label(bucket["canonicalWindow"], bucket["canonicalWindow"]),
            "used": None,
            "limit": None,
            "percent": 1 - bucket["remainingFraction"],
            "resetAt": bucket["resetAt"],
            # The buckets are named "5h" and "weekly".
            "durationSeconds": named_length(bucket["canonicalWindow"]),
            "unit": None,
            "pace": None,
        }
        for bucket in tightest.values()
    ]
    if named:
        return named
    models = [window for window in (_model_window(b) for b in _buckets(payload) if "window" not in b) if window]
    return models[:MAX_LISTED]
