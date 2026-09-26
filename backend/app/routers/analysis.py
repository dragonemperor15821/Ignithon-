"""Missing information, contradictions, redaction and the incident report.

Each `run`/`generate` endpoint reads the saved evidence, extractions and timeline
and writes only its own derived file. GET endpoints return the last saved result.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from app import contradictions, derived_store, extraction_store, missing_info, redaction, report, store, timeline_store
from app.models import (
    ContradictionReport,
    IncidentReport,
    MissingInfoReport,
    RedactedEvidence,
    RedactionSet,
    Timeline,
)
from app.routers.timeline import run_timeline

router = APIRouter(prefix="/api", tags=["analysis"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- 03 missing information ------------------------------------------------


@router.post("/missing-info/run", response_model=MissingInfoReport)
def run_missing_info() -> MissingInfoReport:
    evidence = store.list_all()
    if not evidence:
        return MissingInfoReport(status="pending", notes=["No evidence uploaded yet"])
    extractions = extraction_store.list_all()
    found = missing_info.detect(evidence, extractions, timeline_store.get())

    def build(ids):
        items = [item.model_copy(update={"id": i}) for i, (_, item) in zip(ids, found)]
        notes = [] if items else ["No gaps detected by the current rules"]
        return {
            "report": MissingInfoReport(
                status="ready" if items else "empty",
                generated_at=_now(),
                extraction_count=len(extractions),
                items=items,
                notes=notes,
            )
        }

    return derived_store.missing_info.save([k for k, _ in found], build)["report"]


@router.get("/missing-info", response_model=MissingInfoReport)
def get_missing_info() -> MissingInfoReport:
    raw = derived_store.missing_info.get("report")
    return MissingInfoReport.model_validate(raw) if raw else MissingInfoReport(status="pending")


# --- 04 contradictions -----------------------------------------------------


@router.post("/contradictions/run", response_model=ContradictionReport)
def run_contradictions() -> ContradictionReport:
    extractions = extraction_store.list_all()
    if not extractions:
        return ContradictionReport(status="pending", notes=["No extraction results yet; analyze evidence first"])
    found = contradictions.detect(extractions)
    claim_count = sum(len(r.claims) for r in extractions if r.status == "extracted")

    def build(ids):
        items = [c.model_copy(update={"id": i}) for i, (_, c) in zip(ids, found)]
        return {
            "report": ContradictionReport(
                status="ready" if items else "empty",
                generated_at=_now(),
                claim_count=claim_count,
                contradictions=items,
                notes=[] if items else ["No contradictions detected by the current rules"],
            )
        }

    return derived_store.contradictions.save([k for k, _ in found], build)["report"]


@router.get("/contradictions", response_model=ContradictionReport)
def get_contradictions() -> ContradictionReport:
    raw = derived_store.contradictions.get("report")
    return ContradictionReport.model_validate(raw) if raw else ContradictionReport(status="pending")


# --- 05 redaction ----------------------------------------------------------


@router.post("/redactions/run", response_model=RedactionSet)
def run_redactions() -> RedactionSet:
    evidence = store.list_all()
    if not evidence:
        return RedactionSet(status="pending", notes=["No evidence uploaded yet"])
    results = {r.evidence_id: r for r in extraction_store.list_all()}
    items = [redaction.redact(e, results.get(e.id)) for e in sorted(evidence, key=lambda e: e.id)]
    done = [i for i in items if i.status == "redacted"]
    result = RedactionSet(
        status="ready" if done else "empty",
        generated_at=_now(),
        items=items,
        notes=[] if done else ["No extracted text to redact yet"],
    )
    return derived_store.redactions.save([], lambda _: {"set": result})["set"]


@router.get("/redactions", response_model=RedactionSet)
def get_redactions() -> RedactionSet:
    raw = derived_store.redactions.get("set")
    return RedactionSet.model_validate(raw) if raw else RedactionSet(status="pending")


@router.get("/evidence/{evidence_id}/redacted", response_model=RedactedEvidence)
def get_redacted_evidence(evidence_id: str) -> RedactedEvidence:
    if store.get(evidence_id) is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found")
    item = next((i for i in get_redactions().items if i.evidence_id == evidence_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail=f"No redacted copy yet for {evidence_id}; run redaction first")
    return item


# --- 06 incident report ----------------------------------------------------


@router.post("/report/generate", response_model=IncidentReport)
def generate_report(redacted: bool = False) -> IncidentReport:
    """Refresh every derived layer from the current extractions, then assemble the report."""
    if not store.list_all():
        return IncidentReport(status="pending")
    saved = save_report(run_timeline(), run_missing_info(), run_contradictions(), run_redactions())
    return saved["redacted" if redacted else "report"]


def save_report(
    timeline: Timeline, missing: MissingInfoReport, contradictions_: ContradictionReport, redactions: RedactionSet
) -> dict[str, IncidentReport]:
    """Assemble and persist the report (plain + redacted) from already-generated layer results."""
    built = report.build(
        store.list_all(),
        extraction_store.list_all(),
        timeline,
        missing,
        contradictions_,
        redactions,
        store.UPLOADS_DIR,
        _now(),
    )
    return derived_store.report.save([], lambda _: {"report": built, "redacted": report.redacted_copy(built)})


@router.get("/report", response_model=IncidentReport)
def get_report(redacted: bool = False) -> IncidentReport:
    raw = derived_store.report.get("redacted" if redacted else "report")
    return IncidentReport.model_validate(raw) if raw else IncidentReport(status="pending")


@router.get("/report/markdown", response_class=PlainTextResponse)
def get_report_markdown(redacted: bool = False) -> PlainTextResponse:
    rep = get_report(redacted)
    if rep.status == "pending":
        raise HTTPException(status_code=404, detail="No report generated yet")
    return PlainTextResponse(report.to_markdown(rep), media_type="text/markdown; charset=utf-8")
