"""JSON-file store for extraction results, kept separate from the evidence registry."""

import json
import os
import threading

from app.models import ExtractionResult
from app.store import DATA_DIR

EXTRACTIONS_PATH = DATA_DIR / "extractions.json"

_lock = threading.Lock()


def _load() -> dict:
    if not EXTRACTIONS_PATH.exists():
        return {"next_claim_seq": 1, "extractions": {}}
    return json.loads(EXTRACTIONS_PATH.read_text(encoding="utf-8"))


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = EXTRACTIONS_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(tmp, EXTRACTIONS_PATH)


def save(result: ExtractionResult) -> ExtractionResult:
    """Persist a result, assigning global claim IDs (CL-001...).

    Re-extracting the same evidence keeps the ID of any claim whose text and
    position are unchanged, so downstream references stay valid. IDs are never reused.
    """
    with _lock:
        data = _load()
        previous = data["extractions"].get(result.evidence_id)
        old_ids = {
            (c["claim"], c.get("char_start")): c["id"] for c in (previous or {}).get("claims", [])
        }
        for claim in result.claims:
            existing = old_ids.get((claim.claim, claim.char_start))
            if existing:
                claim.id = existing
            else:
                claim.id = f"CL-{data['next_claim_seq']:03d}"
                data["next_claim_seq"] += 1
        data["extractions"][result.evidence_id] = result.model_dump(mode="json")
        _save(data)
    return result


def get(evidence_id: str) -> ExtractionResult | None:
    with _lock:
        raw = _load()["extractions"].get(evidence_id)
    return ExtractionResult.model_validate(raw) if raw else None


def list_all() -> list[ExtractionResult]:
    with _lock:
        data = _load()
    return [ExtractionResult.model_validate(r) for r in data["extractions"].values()]
