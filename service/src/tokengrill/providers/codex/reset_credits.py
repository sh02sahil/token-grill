"""The Codex rate-limit reset credits."""

import time
from typing import Any

from tokengrill.core.json_util import is_record, number_at, string_at, to_epoch_ms
from tokengrill.core.limits import MAX_LISTED, MAX_RESET_CREDITS
from tokengrill.core.types import LimitResetCredit, LimitResetCreditSummary


def _is_available(credit: dict[str, Any]) -> bool:
    status = string_at(credit, "status")
    if status:
        return status.lower() == "available"
    # Older responses list only unredeemed credits and leave the status out.
    return to_epoch_ms(credit.get("redeemed_at")) is None


def _normalize_credit(credit: dict[str, Any]) -> LimitResetCredit:
    expires = to_epoch_ms(credit.get("expires_at"))
    return {"title": string_at(credit, "title"), "expiresAt": None if expires is None else int(expires)}


def normalize_reset_credits(payload: object, fetched_at: int | None = None) -> LimitResetCreditSummary | None:
    if not is_record(payload):
        return None
    raw = payload.get("credits")
    available = [c for c in raw if is_record(c) and _is_available(c)] if isinstance(raw, list) else []
    count = number_at(payload, "available_count")
    # The popup lists only the first credits; the count still covers all of them. A count no plan could
    # hold is the length of the list instead.
    if count is None or not 0 <= count <= MAX_RESET_CREDITS:
        count = min(len(available), MAX_RESET_CREDITS)
    return {
        "availableCount": round(count),
        "credits": [_normalize_credit(c) for c in available[:MAX_LISTED]],
        "fetchedAt": int(time.time() * 1000) if fetched_at is None else fetched_at,
        "stale": False,
        "error": None,
    }
