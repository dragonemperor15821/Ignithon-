"""Evidence integrity re-verification and the chain-of-custody log. Read-only on evidence."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app import audit, store
from app.integrity import sha256_of_file
from app.models import AuditEvent, Evidence, IntegrityResult

router = APIRouter(prefix="/api", tags=["integrity"])


def verify(evidence: Evidence) -> IntegrityResult:
    """Recompute SHA-256 of the stored original and compare it to the ingestion hash."""
    path = store.UPLOADS_DIR / evidence.stored_filename
    base = {"evidence_id": evidence.id, "expected_sha256": evidence.sha256, "checked_at": datetime.now(timezone.utc)}
    if not path.exists():
        return IntegrityResult(**base, status="INTEGRITY VIOLATION", detail="Stored original is missing")
    actual = sha256_of_file(path)
    if actual == evidence.sha256:
        return IntegrityResult(**base, status="VERIFIED", actual_sha256=actual)
    return IntegrityResult(
        **base, status="INTEGRITY VIOLATION", actual_sha256=actual, detail="SHA-256 differs from the ingestion hash"
    )


@router.get("/integrity", response_model=list[IntegrityResult])
def verify_all() -> list[IntegrityResult]:
    return [verify(e) for e in sorted(store.list_all(), key=lambda e: e.id)]


@router.get("/integrity/{evidence_id}", response_model=IntegrityResult)
def verify_one(evidence_id: str) -> IntegrityResult:
    evidence = store.get(evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")
    return verify(evidence)


@router.get("/audit", response_model=list[AuditEvent])
def get_audit_log() -> list[AuditEvent]:
    return audit.list_events()
