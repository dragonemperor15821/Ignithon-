import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app import audit, extraction_store, store
from app.integrity import sha256_of_file
from app.models import DeleteEvidenceResponse, Evidence, RejectedFile, UploadResponse

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB

# extension -> (evidence type, canonical MIME type)
SUPPORTED = {
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".webp": ("image", "image/webp"),
    ".pdf": ("pdf", "application/pdf"),
    ".txt": ("text", "text/plain"),
    ".csv": ("csv", "text/csv"),
    ".json": ("json", "application/json"),
    ".doc": ("document", "application/msword"),
    ".docx": ("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}


def _safe_name(name: str) -> str:
    base = Path(name).name
    return re.sub(r"[^A-Za-z0-9._-]", "_", base)[:120] or "file"


async def _ingest(upload: UploadFile) -> Evidence | RejectedFile:
    filename = Path(upload.filename or "").name
    if not filename:
        return RejectedFile(filename="(unnamed)", reason="Missing filename")

    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED:
        return RejectedFile(filename=filename, reason=f"Unsupported file type '{ext or 'none'}'")
    ev_type, mime = SUPPORTED[ext]

    # Read fully before touching the registry so rejected files don't consume IDs.
    content = await upload.read(MAX_FILE_SIZE + 1)
    if len(content) == 0:
        return RejectedFile(filename=filename, reason="File is empty")
    if len(content) > MAX_FILE_SIZE:
        return RejectedFile(filename=filename, reason="File exceeds 25 MB limit")

    ev_id = store.reserve_id()
    stored_filename = f"{ev_id}_{_safe_name(filename)}"
    store.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    path = store.UPLOADS_DIR / stored_filename
    path.write_bytes(content)
    path.chmod(0o444)  # originals are read-only

    evidence = Evidence(
        id=ev_id,
        filename=filename,
        stored_filename=stored_filename,
        type=ev_type,
        mime_type=mime,
        size=path.stat().st_size,
        sha256=sha256_of_file(path),
        uploaded_at=datetime.now(timezone.utc),
        status="pending",
    )
    store.add(evidence)
    audit.record("evidence_uploaded", ev_id, detail=filename)
    audit.record("sha256_calculated", ev_id, detail=evidence.sha256)
    return evidence


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_evidence(files: list[UploadFile] = File(...)) -> UploadResponse:
    created: list[Evidence] = []
    rejected: list[RejectedFile] = []
    for upload in files:
        result = await _ingest(upload)
        (created if isinstance(result, Evidence) else rejected).append(result)

    if not created:
        raise HTTPException(
            status_code=400,
            detail={"message": "No valid evidence uploaded", "rejected": [r.model_dump() for r in rejected]},
        )
    return UploadResponse(created=created, rejected=rejected)


@router.get("", response_model=list[Evidence])
def list_evidence() -> list[Evidence]:
    return store.list_all()


@router.get("/{evidence_id}", response_model=Evidence)
def get_evidence(evidence_id: str) -> Evidence:
    evidence = store.get(evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")
    return evidence


@router.delete("/{evidence_id}", response_model=DeleteEvidenceResponse)
def delete_evidence(evidence_id: str) -> DeleteEvidenceResponse:
    """Delete one evidence item: its stored original, its registry record and its extraction result.

    The file is removed first; if that fails nothing else is changed and an error is returned.
    Other evidence is never touched, and the deletion is recorded in the chain of custody."""
    evidence = store.get(evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")

    path = store.UPLOADS_DIR / evidence.stored_filename
    file_removed = False
    if path.exists():
        try:
            path.chmod(0o644)  # originals are stored read-only
            path.unlink()
            file_removed = True
        except OSError as e:
            audit.record("evidence_deleted", evidence_id, status="failed", detail=f"Could not remove stored file: {e}")
            raise HTTPException(status_code=500, detail=f"Could not delete the stored file for {evidence_id}: {e}")

    store.remove(evidence_id)
    extraction_removed = extraction_store.remove(evidence_id)
    audit.record(
        "evidence_deleted",
        evidence_id,
        detail=f"{evidence.filename} (sha256 {evidence.sha256})" + ("" if file_removed else "; stored file was already missing"),
    )
    return DeleteEvidenceResponse(
        deleted=evidence_id,
        filename=evidence.filename,
        sha256=evidence.sha256,
        file_removed=file_removed,
        extraction_removed=extraction_removed,
        message=f"Evidence {evidence_id} ({evidence.filename}) deleted",
    )
