"""One account's reading can never make the readings file unloadable for all accounts."""

import json
from pathlib import Path

from tokengrill.core.limits import MAX_LISTED
from tokengrill.core.types import ProviderSnapshot, empty_snapshot
from tokengrill.storage.readings import ReadingStore, parse_stored_reading

NOW = 1_800_000_000_000


def _snapshot(account_id: str, **changes: object) -> ProviderSnapshot:
    window = {
        "id": "five-hour-0",
        "canonicalWindow": "five-hour",
        "label": "Five-hour",
        "used": None,
        "limit": None,
        "percent": 0.5,
        "resetAt": NOW + 1000,
        "durationSeconds": 18000,
        "unit": None,
        "pace": None,
    }
    return {**empty_snapshot(account_id), "windows": [window], "quotaFetchedAt": NOW, **changes}  # type: ignore[typeddict-item]


def test_a_stored_number_too_large_for_a_float_drops_the_entry_and_does_not_raise() -> None:
    stored = {
        "plan": None,
        "balance": None,
        "resetCredits": None,
        "fetchedAt": NOW,
        "windows": [
            {
                "id": "w",
                "canonicalWindow": "other",
                "label": "w",
                "used": None,
                "limit": None,
                "percent": 0.1,
                "resetAt": -(10**309),
                "durationSeconds": None,
                "unit": None,
            }
        ],
    }
    assert parse_stored_reading(stored) is None


async def test_a_file_with_an_overflowing_number_still_loads_the_other_accounts(tmp_path: Path) -> None:
    good = {"plan": None, "balance": None, "resetCredits": None, "fetchedAt": NOW, "windows": []}
    bad = {
        **good,
        "windows": [
            {
                "id": "w",
                "canonicalWindow": "other",
                "label": "w",
                "used": None,
                "limit": None,
                "percent": 0.1,
                "resetAt": -(10**309),
                "durationSeconds": None,
                "unit": None,
            }
        ],
    }
    path = tmp_path / "readings-v1.json"
    path.write_text(json.dumps({"schemaVersion": 1, "accounts": {"good": good, "bad": bad}}))
    store = ReadingStore(path)
    await store.load()
    assert store.get("good") is not None
    assert store.get("bad") is None


def test_an_out_of_range_credit_count_drops_the_entry() -> None:
    credits = {"availableCount": 10**20, "credits": [], "fetchedAt": NOW, "stale": False}
    assert (
        parse_stored_reading({"plan": None, "balance": None, "resetCredits": credits, "fetchedAt": NOW, "windows": []})
        is None
    )


async def test_an_oversize_reading_is_not_kept_and_the_others_survive_a_restart(tmp_path: Path) -> None:
    path = tmp_path / "readings-v1.json"
    store = ReadingStore(path)
    store.set(_snapshot("small"))
    store.set(_snapshot("huge", plan="x" * 200_000))
    await store.flush()
    again = ReadingStore(path)
    await again.load()
    assert again.get("small") is not None
    assert again.get("huge") is None


def test_stored_lists_are_cut() -> None:
    credits = {
        "availableCount": 500,
        "credits": [{"title": None, "expiresAt": None}] * 500,
        "fetchedAt": NOW,
        "stale": False,
        "error": None,
    }
    store = ReadingStore(Path("/nonexistent/readings-v1.json"))
    store.set(_snapshot("a", resetCredits=credits))
    reading = store.get("a")
    assert reading is not None
    assert reading["resetCredits"] is not None
    assert len(reading["resetCredits"]["credits"]) == MAX_LISTED
