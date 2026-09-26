"""JSON-file store for the generated timeline, kept separate from evidence and extractions."""

import json
import os
import threading
from datetime import datetime, timezone

from app.models import Timeline, TimelineEvent
from app.store import DATA_DIR
from app.timeline import order_events

TIMELINE_PATH = DATA_DIR / "timeline.json"

_lock = threading.Lock()


def _load() -> dict:
    if not TIMELINE_PATH.exists():
        return {"next_event_seq": 1, "event_ids": {}, "timeline": None}
    return json.loads(TIMELINE_PATH.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = TIMELINE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(tmp, TIMELINE_PATH)


def save(candidates: list[tuple[str, TimelineEvent]], extraction_count: int) -> Timeline:
    """Persist a rebuilt timeline, assigning event IDs (TL-001...).

    An event keeps its ID across rebuilds as long as its claim text is unchanged.
    IDs are never reused.
    """
    with _lock:
        data = _load()
        for key, event in candidates:
            if key not in data["event_ids"]:
                data["event_ids"][key] = f"TL-{data['next_event_seq']:03d}"
                data["next_event_seq"] += 1
            event.id = data["event_ids"][key]
        events = order_events([e for _, e in candidates])
        timeline = Timeline(
            status="ready" if events else "empty",
            generated_at=datetime.now(timezone.utc),
            extraction_count=extraction_count,
            events=events,
            notes=[] if events else ["No extracted claim states a time, date or amount"],
        )
        data["timeline"] = timeline.model_dump(mode="json")
        _save(data)
    return timeline


def get() -> Timeline:
    with _lock:
        raw = _load()["timeline"]
    return Timeline.model_validate(raw) if raw else Timeline(status="pending")
