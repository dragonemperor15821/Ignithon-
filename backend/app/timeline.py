"""Timeline construction: turn saved extraction claims into incident events.

Rules:
- Events come only from extracted claims; the description is the verbatim claim text.
- A claim becomes an event when it states a timestamp or an amount. Claims that
  only carry identifiers (transaction IDs, URLs, ...) stay in the extraction layer.
- `date`/`time` are taken only from entities inside that same claim, and only when
  there is exactly one unambiguous value. Otherwise they stay None - never guessed,
  never borrowed from a neighbouring sentence, never defaulted to today.
- Claims with identical text (whitespace/case-insensitive) are one event with all
  their sources. Anything else, including conflicting timestamps, stays separate.
"""

from app.models import Claim, ExtractedEntity, ExtractionResult, TimelineEvent

TIMESTAMP_TYPES = {"datetime", "date", "time"}
EVENT_TYPES = TIMESTAMP_TYPES | {"amount"}


def event_key(claim_text: str) -> str:
    """Identity of an event across runs; also the merge key across evidence."""
    return " ".join(claim_text.split()).casefold()


def _pick(kind: str, candidates: list[tuple[str | None, str]], notes: list[str]) -> tuple[str | None, str | None]:
    """Return (normalized, raw) when exactly one distinct value is stated, else (None, None)."""
    distinct: dict[str, tuple[str | None, str]] = {}
    for normalized, raw in candidates:
        distinct.setdefault(normalized or raw, (normalized, raw))
    if not distinct:
        return None, None
    if len(distinct) > 1:
        raws = ", ".join(f"'{raw}'" for _, raw in distinct.values())
        notes.append(f"Multiple {kind}s stated ({raws}); none chosen")
        return None, None
    normalized, raw = next(iter(distinct.values()))
    if normalized is None:
        notes.append(f"{kind.capitalize()} '{raw}' is ambiguous or unrecognised; not normalized")
    return normalized, raw


def _timestamp(entities: list[ExtractedEntity]) -> tuple[str | None, str | None, str | None, str | None, list[str]]:
    """(date, time, date_raw, time_raw, notes) from the entities of a single claim."""
    dates: list[tuple[str | None, str]] = []
    times: list[tuple[str | None, str]] = []
    for e in entities:
        if e.type == "datetime" and e.normalized:
            date_part, time_part = e.normalized.split("T")
            if e.raw.count(":") == 1:  # seconds were not written, don't show ':00'
                time_part = time_part[:5]
            dates.append((date_part, e.raw))
            times.append((time_part, e.raw))
        elif e.type == "date":
            dates.append((e.normalized, e.raw))
        elif e.type == "time":
            times.append((e.normalized, e.raw))

    notes: list[str] = []
    date, date_raw = _pick("date", dates, notes)
    time, time_raw = _pick("time", times, notes)
    return date, time, date_raw, time_raw, notes


def build_events(extractions: list[ExtractionResult]) -> list[tuple[str, TimelineEvent]]:
    """Return (key, event) pairs with empty IDs; IDs are assigned by the timeline store."""
    events: dict[str, TimelineEvent] = {}
    for result in sorted(extractions, key=lambda r: r.evidence_id):
        if result.status != "extracted":
            continue
        by_id = {e.id: e for e in result.entities}
        claims: list[Claim] = sorted(result.claims, key=lambda c: (c.char_start or 0, c.id))
        for claim in claims:
            entities = [by_id[i] for i in claim.entity_ids if i in by_id]
            if not any(e.type in EVENT_TYPES for e in entities):
                continue

            key = event_key(claim.claim)
            existing = events.get(key)
            if existing:
                existing.source_claim_ids.append(claim.id)
                existing.source_evidence_ids = sorted(set(existing.source_evidence_ids) | set(claim.source_evidence_ids))
                existing.entity_ids += [e.id for e in entities]
                existing.entities += entities
                continue

            date, time, date_raw, time_raw, notes = _timestamp(entities)
            events[key] = TimelineEvent(
                id="",
                date=date,
                time=time,
                date_raw=date_raw,
                time_raw=time_raw,
                description=claim.claim,
                source_evidence_ids=sorted(set(claim.source_evidence_ids)),
                source_claim_ids=[claim.id],
                entity_ids=[e.id for e in entities],
                entities=entities,
                placement="dated" if date else "undated",
                notes=notes,
            )
    return list(events.items())


def _seq(event: TimelineEvent) -> int:
    return int(event.id.rsplit("-", 1)[1])


def order_events(events: list[TimelineEvent]) -> list[TimelineEvent]:
    """Dated events by (date, time, ID); date-only sorts first within its day.
    Undated events are not placed relative to anything - they follow, by ID."""
    dated = sorted((e for e in events if e.date), key=lambda e: (e.date, e.time or "", _seq(e)))
    undated = sorted((e for e in events if not e.date), key=_seq)
    return dated + undated
