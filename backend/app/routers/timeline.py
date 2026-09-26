from fastapi import APIRouter, HTTPException

from app import extraction_store, timeline_store
from app.models import Timeline, TimelineEvent
from app.timeline import build_events

router = APIRouter(prefix="/api", tags=["timeline"])


@router.post("/timeline/run", response_model=Timeline)
def run_timeline() -> Timeline:
    """Rebuild the timeline from the saved extraction results (read-only on extractions)."""
    extractions = extraction_store.list_all()
    if not extractions:
        return Timeline(status="pending", notes=["No extraction results yet; analyze evidence first"])
    return timeline_store.save(build_events(extractions), len(extractions))


@router.get("/timeline", response_model=Timeline)
def get_timeline() -> Timeline:
    return timeline_store.get()


@router.get("/timeline/{event_id}", response_model=TimelineEvent)
def get_timeline_event(event_id: str) -> TimelineEvent:
    event = next((e for e in timeline_store.get().events if e.id == event_id), None)
    if event is None:
        raise HTTPException(status_code=404, detail=f"Timeline event {event_id} not found")
    return event
