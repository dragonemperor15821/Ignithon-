"""JSON-file evidence registry. Metadata only; originals live in data/uploads/."""

import json
import os
import threading
from pathlib import Path

from app.models import Evidence

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
REGISTRY_PATH = DATA_DIR / "evidence.json"

_lock = threading.Lock()


def _load() -> dict:
    if not REGISTRY_PATH.exists():
        return {"next_seq": 1, "evidence": []}
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = REGISTRY_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    os.replace(tmp, REGISTRY_PATH)


def reserve_id() -> str:
    """Allocate the next stable evidence ID. IDs are never reused, even if an upload fails."""
    with _lock:
        data = _load()
        seq = data["next_seq"]
        data["next_seq"] = seq + 1
        _save(data)
    return f"EV-{seq:03d}"


def add(evidence: Evidence) -> None:
    with _lock:
        data = _load()
        data["evidence"].append(evidence.model_dump(mode="json"))
        _save(data)


def list_all() -> list[Evidence]:
    with _lock:
        data = _load()
    return [Evidence(**e) for e in data["evidence"]]


def get(evidence_id: str) -> Evidence | None:
    return next((e for e in list_all() if e.id == evidence_id), None)


def remove(evidence_id: str) -> Evidence | None:
    """Drop one record from the registry. Other records and the ID counter are untouched (IDs are never reused)."""
    with _lock:
        data = _load()
        kept = [e for e in data["evidence"] if e["id"] != evidence_id]
        if len(kept) == len(data["evidence"]):
            return None
        removed = next(e for e in data["evidence"] if e["id"] == evidence_id)
        data["evidence"] = kept
        _save(data)
    return Evidence(**removed)
