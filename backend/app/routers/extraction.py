from fastapi import APIRouter, HTTPException

from app import audit, extraction_store, store
from app.extraction import extract
from app.models import Evidence, ExtractionResult

router = APIRouter(prefix="/api", tags=["extraction"])


def _run(evidence: Evidence) -> ExtractionResult:
    path = store.UPLOADS_DIR / evidence.stored_filename
    if not path.exists():
        raise HTTPException(status_code=409, detail=f"Original file for {evidence.id} is missing")
    result = extraction_store.save(extract(evidence, path))
    audit.record(
        "ocr_completed" if result.method == "ocr" else "extraction_completed",
        evidence.id,
        status=result.status,
        detail=f"{len(result.claims)} claims" if result.status == "extracted" else (result.notes or [None])[0],
    )
    return result


@router.post("/evidence/{evidence_id}/extract", response_model=ExtractionResult)
def extract_evidence(evidence_id: str) -> ExtractionResult:
    evidence = store.get(evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")
    return _run(evidence)


@router.get("/evidence/{evidence_id}/extraction", response_model=ExtractionResult)
def get_extraction(evidence_id: str) -> ExtractionResult:
    if store.get(evidence_id) is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")
    result = extraction_store.get(evidence_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No extraction yet for {evidence_id}")
    return result


@router.get("/extractions", response_model=list[ExtractionResult])
def list_extractions() -> list[ExtractionResult]:
    return extraction_store.list_all()


@router.post("/extraction/run", response_model=list[ExtractionResult])
def run_all(force: bool = False) -> list[ExtractionResult]:
    """Extract every evidence item that has no extraction yet (or all, with ?force=true)."""
    done = {r.evidence_id for r in extraction_store.list_all()}
    return [_run(ev) for ev in store.list_all() if force or ev.id not in done]
