"""Case-level orchestration: analyze the entire case in one call.

Runs the existing stage implementations in a fixed order:
    extraction -> timeline -> missing_info -> contradictions -> redaction -> report
No analysis logic lives here; each stage calls the same function its own endpoint uses.

Failure handling:
- An evidence item that cannot be analyzed is recorded as an error; the others continue.
- A stage that raises is reported as failed and the stages after it are skipped
  (they depend on its output), so nothing is presented as fresh when it is not.
"""

import json
import queue
import threading
import time
from collections import Counter
from collections.abc import Iterator
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app import derived_store, extraction_store, store
from app.models import CaseAnalysis, CaseError, CaseOverview, CaseStage, StageResult
from app.routers import analysis
from app.routers import extraction as extraction_router
from app.routers import timeline as timeline_router

router = APIRouter(prefix="/api/case", tags=["case"])

STAGES: list[tuple[CaseStage, str]] = [
    ("extraction", "EXTRACTING EVIDENCE"),
    ("timeline", "BUILDING TIMELINE"),
    ("missing_info", "DETECTING EVIDENCE GAPS"),
    ("contradictions", "DETECTING CONTRADICTIONS"),
    ("redaction", "REDACTING PII"),
    ("report", "GENERATING INCIDENT REPORT"),
]
DONE_STATUSES = ("extracted", "no_text")  # analyzed; "unavailable"/"failed" are retried

_running = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _error_text(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail) if detail else f"{type(exc).__name__}: {exc}"


# --- stages: each calls the existing implementation and records counts ------


def _extract(ctx: dict, stage: StageResult, errors: list[CaseError]) -> None:
    previous = {r.evidence_id: r for r in extraction_store.list_all()}
    stage.processed = stage.reused = stage.failed = 0
    for ev in sorted(store.list_all(), key=lambda e: e.id):
        prior = previous.get(ev.id)
        if prior is not None and prior.status in DONE_STATUSES and not ctx["force"]:
            stage.reused += 1  # keeps its claim IDs and results exactly as they are
            continue
        try:
            result = extraction_router._run(ev)
        except Exception as exc:  # one bad item never stops the case
            stage.failed += 1
            errors.append(CaseError(stage="extraction", evidence_id=ev.id, message=_error_text(exc)))
            continue
        stage.processed += 1
        if result.status not in DONE_STATUSES:
            stage.failed += 1
            reason = result.notes[0] if result.notes else result.status
            errors.append(CaseError(stage="extraction", evidence_id=ev.id, message=f"{result.status}: {reason}"))


def _timeline(ctx: dict, stage: StageResult, errors: list[CaseError]) -> None:
    ctx["timeline"] = timeline_router.run_timeline()
    stage.events = len(ctx["timeline"].events)


def _missing_info(ctx: dict, stage: StageResult, errors: list[CaseError]) -> None:
    ctx["missing"] = analysis.run_missing_info()
    stage.items = len(ctx["missing"].items)


def _contradictions(ctx: dict, stage: StageResult, errors: list[CaseError]) -> None:
    ctx["contradictions"] = analysis.run_contradictions()
    stage.items = len(ctx["contradictions"].contradictions)


def _redaction(ctx: dict, stage: StageResult, errors: list[CaseError]) -> None:
    ctx["redactions"] = analysis.run_redactions()
    done = [i for i in ctx["redactions"].items if i.status == "redacted"]
    stage.items = len(done)
    stage.masked = sum(len(i.spans) for i in done)


def _report(ctx: dict, stage: StageResult, errors: list[CaseError]) -> None:
    saved = analysis.save_report(ctx["timeline"], ctx["missing"], ctx["contradictions"], ctx["redactions"])
    stage.statements = sum(len(s.statements) for s in saved["report"].sections)


RUNNERS = {
    "extraction": _extract,
    "timeline": _timeline,
    "missing_info": _missing_info,
    "contradictions": _contradictions,
    "redaction": _redaction,
    "report": _report,
}


def run_pipeline(force: bool = False) -> Iterator[dict]:
    """Run the whole case, yielding progress events; the last event carries the final CaseAnalysis."""
    evidence = store.list_all()
    result = CaseAnalysis(
        status="running",
        started_at=_now(),
        evidence_total=len(evidence),
        evidence_by_type=dict(sorted(Counter(e.type for e in evidence).items())),
        stages={name: StageResult() for name, _ in STAGES},
    )

    if not evidence:
        for stage in result.stages.values():
            stage.status = "skipped"
        result.status = "empty"
    else:
        ctx: dict = {"force": force}
        failed_stage: str | None = None
        for name, label in STAGES:
            stage = result.stages[name]
            if failed_stage:
                stage.status = "skipped"
                stage.error = f"Skipped because the {failed_stage} stage failed"
                yield {"event": "stage", "stage": name, "label": label, "result": stage.model_dump()}
                continue
            stage.status = "running"
            yield {"event": "stage", "stage": name, "label": label, "result": stage.model_dump()}
            started = time.perf_counter()
            try:
                RUNNERS[name](ctx, stage, result.errors)
                stage.status = "completed"
            except Exception as exc:
                stage.status = "failed"
                stage.error = _error_text(exc)
                result.errors.append(CaseError(stage=name, message=stage.error))
                failed_stage = name
            stage.duration_ms = round((time.perf_counter() - started) * 1000)
            yield {"event": "stage", "stage": name, "label": label, "result": stage.model_dump()}

        done = {r.evidence_id for r in extraction_store.list_all() if r.status == "extracted"}
        result.evidence_analyzed = sum(1 for e in evidence if e.id in done)
        result.status = "failed" if failed_stage else ("completed_with_errors" if result.errors else "completed")

    result.finished_at = _now()
    derived_store.case.save([], lambda _: {"last_run": result})
    yield {"event": "done", "result": result.model_dump(mode="json")}


def _acquire() -> None:
    if not _running.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="A case analysis is already running")


@router.post("/analyze", response_model=CaseAnalysis)
def analyze_case(force: bool = False) -> CaseAnalysis:
    """Analyze the entire case and return the stage results when finished.

    `force=true` re-extracts evidence that was already analyzed; by default only
    pending items (never analyzed, or previously unavailable/failed) are extracted."""
    _acquire()
    try:
        final = None
        for event in run_pipeline(force):
            final = event
        return CaseAnalysis.model_validate(final["result"])
    finally:
        _running.release()


@router.post("/analyze/stream")
def analyze_case_stream(force: bool = False) -> StreamingResponse:
    """Same pipeline, streamed as NDJSON progress events for the UI.

    The pipeline runs in its own thread, so a closed browser tab cannot leave a case half-analyzed."""
    _acquire()
    events: queue.Queue = queue.Queue()

    def work() -> None:
        try:
            for event in run_pipeline(force):
                events.put(event)
        except Exception as exc:  # defensive: never leave the client waiting
            events.put({"event": "error", "message": _error_text(exc)})
        finally:
            _running.release()
            events.put(None)

    threading.Thread(target=work, name="case-analysis", daemon=True).start()

    def stream() -> Iterator[str]:
        while (event := events.get()) is not None:
            yield json.dumps(event, default=str) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@router.get("", response_model=CaseOverview)
def case_overview() -> CaseOverview:
    evidence = store.list_all()
    results = {r.evidence_id: r for r in extraction_store.list_all()}
    analyzed = sum(1 for e in evidence if e.id in results and results[e.id].status in DONE_STATUSES)
    raw = derived_store.case.get("last_run")
    return CaseOverview(
        evidence_total=len(evidence),
        evidence_by_type=dict(sorted(Counter(e.type for e in evidence).items())),
        analyzed=analyzed,
        pending=len(evidence) - analyzed,
        last_run=CaseAnalysis.model_validate(raw) if raw else None,
    )
