"""Append-only chain-of-custody log (data/audit.json).

Recording is best-effort: a logging problem never interrupts the action being logged.
"""

import json
import os
import threading
from datetime import datetime, timezone

from app import store
from app.models import AuditEvent

_lock = threading.Lock()


def _path():
    return store.DATA_DIR / "audit.json"  # resolved per call so tests can redirect DATA_DIR


def record(action: str, evidence_id: str | None = None, status: str = "ok", detail: str | None = None) -> None:
    try:
        with _lock:
            path = _path()
            events = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
            events.append(
                AuditEvent(
                    seq=len(events) + 1,
                    timestamp=datetime.now(timezone.utc),
                    action=action,
                    evidence_id=evidence_id,
                    status=status,
                    detail=detail,
                ).model_dump(mode="json")
            )
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(events, indent=2, ensure_ascii=False), encoding="utf-8")
            os.replace(tmp, path)
    except Exception:  # never let the audit trail break the evidence pipeline
        pass


def list_events() -> list[AuditEvent]:
    with _lock:
        path = _path()
        raw = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    return [AuditEvent.model_validate(e) for e in raw]
