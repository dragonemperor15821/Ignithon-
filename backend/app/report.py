"""Incident report assembled from the evidence, extraction, timeline and analysis layers.

Rules:
- The report restates what the evidence and the analyses say. It draws no
  conclusions and does not decide which statements are true.
- Every statement lists the evidence / claim / event / analysis IDs it rests on.
  Repetitive material is summarised (grouped or capped) but every claim, event
  and analysis item stays referenced somewhere in the report.
- The redacted variant passes every statement through the same redaction rules
  used for derived evidence text.
"""

import re
from collections import Counter
from pathlib import Path

from app import redaction
from app.integrity import sha256_of_file
from app.models import (
    ContradictionReport,
    Evidence,
    ExtractionResult,
    IncidentReport,
    MissingInfoReport,
    RedactionSet,
    ReportSection,
    ReportStatement,
    Timeline,
)
from app.timeline import event_key

S = ReportStatement

INDICATORS = [
    ("url", "URLs"),
    ("transaction_id", "Transaction IDs"),
    ("amount", "Amounts"),
    ("phone_number", "Phone numbers"),
    ("email_address", "Email addresses"),
]
MAX_INDICATOR_VALUES = 5
MAX_GAP_EXAMPLES = 3
MIN_SIMILAR_GROUP = 3

GAP_SUMMARY = {
    "unreadable_evidence": "no text could be read",
    "not_analyzed": "evidence not analyzed yet",
    "unresolved_date": "a date is written but not resolved to a calendar date (day/month order not stated)",
    "missing_timestamp": "an amount is stated with no date or time",
    "missing_date": "a time is stated without a date in the same statement",
    "missing_time": "a dated transaction has no time",
    "missing_currency": "a number in a payment statement has no currency marker",
    "missing_amount": "a payment is mentioned without a readable amount",
    "missing_transaction_id": "payments are described but no transaction/reference ID is stated",
    "unidentified_actor": "a sender/caller is referred to but never identified by phone or email",
    "unplaced_event": "an event is placed only by a relative time (e.g. 'later')",
}


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _event_when(e) -> str:
    if e.date:
        when = e.date
    elif e.date_raw:
        when = f"date unresolved ('{e.date_raw}')"
    else:
        when = "date unknown"
    return f"{when}, {e.time}" if e.time else f"{when}, time unknown"


def _summary(evidence, extracted, claims, timeline, missing, contradictions) -> list[ReportStatement]:
    dated = [e for e in timeline.events if e.placement == "dated"]
    types = Counter(e.type for e in evidence)
    out = [
        S(
            text=f"{_plural(len(evidence), 'evidence item')} registered ("
            + ", ".join(f"{n} {t}" for t, n in sorted(types.items())) + ").",
            evidence_ids=[e.id for e in evidence],
        ),
        S(
            text=f"Text was read from {len(extracted)} of {len(evidence)} items"
            + (
                " (" + ", ".join(f"{n} via {m}" for m, n in sorted(Counter(r.method for r in extracted).items())) + ")."
                if extracted else "."
            ),
            evidence_ids=[r.evidence_id for r in extracted],
        ),
        S(
            text=f"{_plural(len(claims), 'claim')} extracted verbatim; the timeline has "
            f"{_plural(len(timeline.events), 'event')} ({len(dated)} with a resolved date).",
            claim_ids=[c.id for _, c in claims],
            event_ids=[e.id for e in timeline.events],
        ),
    ]
    if dated:
        first, last = dated[0], dated[-1]
        out.append(
            S(
                text=f"Dated events run from {first.id} ({_event_when(first)}) to {last.id} ({_event_when(last)}).",
                evidence_ids=sorted(set(first.source_evidence_ids) | set(last.source_evidence_ids)),
                claim_ids=first.source_claim_ids + last.source_claim_ids,
                event_ids=[first.id, last.id],
            )
        )
    for etype, label in INDICATORS:
        seen: dict[str, tuple[str, set[str]]] = {}
        for r in extracted:
            for ent in r.entities:
                if ent.type == etype:
                    seen.setdefault((ent.normalized or ent.raw).lower(), (ent.raw, set()))[1].add(r.evidence_id)
        if not seen:
            continue
        # most corroborated first, then first appearance; long lists are capped
        ranked = sorted(seen.values(), key=lambda v: -len(v[1]))
        shown = "; ".join(f"{raw} ({', '.join(sorted(evs))})" for raw, evs in ranked[:MAX_INDICATOR_VALUES])
        more = len(ranked) - MAX_INDICATOR_VALUES
        out.append(
            S(
                text=f"{label} stated ({len(ranked)}): {shown}" + (f"; and {more} more." if more > 0 else "."),
                evidence_ids=sorted({ev for _, evs in ranked for ev in evs}),
            )
        )
    high = sum(1 for i in missing.items if i.severity == "high")
    out += [
        S(
            text=f"{_plural(len(missing.items), 'missing-information item')} open ({high} high severity).",
            item_ids=[i.id for i in missing.items],
        ),
        S(
            text=f"{_plural(len(contradictions.contradictions), 'contradiction')} flagged and left unresolved.",
            item_ids=[c.id for c in contradictions.contradictions],
        ),
        S(text="This report restates what the evidence says. It does not determine which statements are true."),
    ]
    return out


def build(
    evidence: list[Evidence],
    extractions: list[ExtractionResult],
    timeline: Timeline,
    missing: MissingInfoReport,
    contradictions: ContradictionReport,
    redactions: RedactionSet,
    uploads_dir: Path,
    generated_at,
) -> IncidentReport:
    evidence = sorted(evidence, key=lambda e: e.id)
    results = {r.evidence_id: r for r in extractions}
    extracted = [results[e.id] for e in evidence if e.id in results and results[e.id].status == "extracted"]
    claims = [(r.evidence_id, c) for r in extracted for c in sorted(r.claims, key=lambda c: (c.char_start or 0, c.id))]
    on_timeline = {cid for e in timeline.events for cid in e.source_claim_ids}

    # --- evidence inventory (one compact line per item) --------------------
    inventory = []
    for e in evidence:
        r = results.get(e.id)
        if r is None:
            state = "not analyzed"
        elif r.status == "extracted":
            state = f"{r.method}, {_plural(len(r.claims), 'claim')}"
        else:
            state = f"{r.status}: {r.notes[0] if r.notes else 'no detail'}"
        inventory.append(
            S(
                text=f"{e.id} · {e.filename} · {e.type} · {e.size:,} B · sha256 {e.sha256[:16]}… · {state}",
                evidence_ids=[e.id],
                claim_ids=[c.id for c in r.claims] if r else [],
            )
        )

    # --- claims not already quoted on the timeline; identical wording merged --
    merged: dict[str, S] = {}
    for ev, c in claims:
        if c.id in on_timeline:
            continue
        st = merged.get(event_key(c.claim))
        if st is None:
            merged[event_key(c.claim)] = S(text=f"“{c.claim}”", evidence_ids=[ev], claim_ids=[c.id])
        else:
            st.claim_ids.append(c.id)
            if ev not in st.evidence_ids:
                st.evidence_ids.append(ev)
    # claims that differ only in their numbers (e.g. one "UTR …" line per bank alert) are listed once
    by_shape: dict[str, list[S]] = {}
    for key, st in merged.items():
        by_shape.setdefault(re.sub(r"\d+", "#", key), []).append(st)
    claim_section = []
    for group in by_shape.values():
        if len(group) < MIN_SIMILAR_GROUP:
            claim_section += group
            continue
        claim_section.append(
            S(
                text=f"{len(group)} claims with the same wording, differing only in their numbers: "
                f"{group[0].text} … {group[-1].text}",
                evidence_ids=[ev for st in group for ev in st.evidence_ids],
                claim_ids=[c for st in group for c in st.claim_ids],
            )
        )

    timeline_section = [
        S(
            text=f"{e.id} — {_event_when(e)}: “{e.description}”" + "".join(f" ⚠ {n}" for n in e.notes),
            evidence_ids=e.source_evidence_ids,
            claim_ids=e.source_claim_ids,
            event_ids=[e.id],
        )
        for e in timeline.events
    ]

    # --- missing information: one statement per category -------------------
    missing_section = []
    by_category: dict[str, list] = {}
    for item in missing.items:
        by_category.setdefault(item.category, []).append(item)
    for category, items in by_category.items():  # already ordered by severity
        examples = [i for i in items if i.supporting_text][:MAX_GAP_EXAMPLES]
        text = f"{category.replace('_', ' ')} — {len(items)} × [{items[0].severity}]: {GAP_SUMMARY.get(category, category)}."
        if category in ("unreadable_evidence", "not_analyzed"):
            text += " " + "; ".join(f"{i.source_evidence_ids[0]}: {i.description}" for i in items)
        elif examples:
            text += " E.g. " + "; ".join(f"{i.id} “{i.supporting_text}”" for i in examples)
            if len(items) > len(examples):
                text += f"; and {len(items) - len(examples)} more"
        missing_section.append(
            S(
                text=text,
                evidence_ids=sorted({ev for i in items for ev in i.source_evidence_ids}),
                claim_ids=[c for i in items for c in i.source_claim_ids],
                event_ids=sorted({ev for i in items for ev in i.timeline_event_ids}),
                item_ids=[i.id for i in items],
            )
        )

    contradiction_section = []
    for c in contradictions.contradictions:
        side_a = c.claims_a or [c.claim_a]
        side_b = c.claims_b or [c.claim_b]
        extra = len(side_a) + len(side_b) - 2
        contradiction_section.append(
            S(
                text=f"{c.id} [{c.type}] {c.explanation} "
                f"A: “{c.claim_a.text}” ({c.claim_a.claim_id}, {c.claim_a.evidence_id}) — "
                f"B: “{c.claim_b.text}” ({c.claim_b.claim_id}, {c.claim_b.evidence_id})"
                + (f" (+{extra} more claims)" if extra else ""),
                evidence_ids=sorted({r.evidence_id for r in side_a + side_b}),
                claim_ids=[r.claim_id for r in side_a + side_b],
                item_ids=[c.id],
            )
        )

    # --- integrity + redaction, aggregated; exceptions listed individually --
    matched, problems = [], []
    for e in evidence:
        path = uploads_dir / e.stored_filename
        if not path.exists():
            problems.append(S(text=f"{e.id}: original file is MISSING.", evidence_ids=[e.id]))
        elif sha256_of_file(path) != e.sha256:
            problems.append(S(text=f"{e.id}: SHA-256 DOES NOT MATCH the registered hash.", evidence_ids=[e.id]))
        else:
            matched.append(e.id)
    redaction_section = [
        S(
            text=f"Originals re-hashed at report time: {len(matched)} of {len(evidence)} match their registered SHA-256.",
            evidence_ids=matched,
        ),
        *problems,
    ]
    redacted = [r for r in redactions.items if r.status == "redacted"]
    totals: Counter = Counter()
    for r in redacted:
        totals.update(r.counts)
    if redacted:
        masked = ", ".join(f"{n} {t}" for t, n in sorted(totals.items())) or "no sensitive identifiers"
        redaction_section.append(
            S(
                text=f"Redacted copies of {_plural(len(redacted), 'item')} mask: {masked}. Originals are not modified.",
                evidence_ids=[r.evidence_id for r in redacted],
            )
        )
    no_copy = [r.evidence_id for r in redactions.items if r.status != "redacted"]
    if no_copy:
        redaction_section.append(S(text=f"No redacted copy (no readable text): {', '.join(no_copy)}.", evidence_ids=no_copy))

    # --- limitations -------------------------------------------------------
    limitations = [
        S(text="Extraction and analysis are rule-based: claims are sentences with a recognised value or incident "
          "action; gaps and contradictions are flagged for review, can miss or over-flag, and are never resolved "
          "automatically."),
        S(text="Values are compared within a sentence; an adjacent sentence is only linked when unambiguous "
          "(one stating just a transaction ID next to one stating just an amount)."),
        S(text="Redaction is pattern-based; names and addresses are only masked when explicitly labelled "
          "(a name or address field, or a title such as Mr or Mrs). Review before sharing."),
    ]
    ocr = [r.evidence_id for r in extracted if r.method == "ocr"]
    if ocr:
        limitations.append(
            S(
                text=f"{_plural(len(ocr), 'item')} read by OCR (capture confidence 0.7). Spacing and digit slips are "
                "repaired deterministically (raw OCR kept), but symbols such as '₹' can be lost; "
                "check against the original image.",
                evidence_ids=ocr,
            )
        )
    unresolved = [e for e in timeline.events if e.date_raw and not e.date]
    if unresolved:
        limitations.append(
            S(
                text=f"{_plural(len(unresolved), 'event')} state a date that was not resolved, so they are not "
                "placed chronologically.",
                event_ids=[e.id for e in unresolved],
            )
        )
    truncated = [r.evidence_id for r in extracted if r.text_truncated]
    if truncated:
        limitations.append(S(text="Some evidence text was truncated before analysis.", evidence_ids=truncated))

    sections = [
        ReportSection(
            key="summary", title="Incident summary",
            statements=_summary(evidence, extracted, claims, timeline, missing, contradictions),
        ),
        ReportSection(key="evidence", title="Evidence inventory", statements=inventory),
        ReportSection(key="timeline", title="Reconstructed timeline", statements=timeline_section),
        ReportSection(key="claims", title="Other extracted claims (not on the timeline)", statements=claim_section),
        ReportSection(key="missing", title="Missing information", statements=missing_section),
        ReportSection(key="contradictions", title="Contradictions", statements=contradiction_section),
        ReportSection(key="redaction", title="Integrity and redaction", statements=redaction_section),
        ReportSection(key="limitations", title="Limitations and uncertainties", statements=limitations),
    ]
    return IncidentReport(
        status="ready" if evidence else "empty", generated_at=generated_at, redacted=False, sections=sections
    )


def redacted_copy(report: IncidentReport) -> IncidentReport:
    copy = report.model_copy(deep=True)
    copy.redacted = True
    for section in copy.sections:
        for st in section.statements:
            st.text = redaction.apply(st.text, redaction.find_spans(st.text))
    return copy


def to_markdown(report: IncidentReport) -> str:
    lines = ["# CaseForge incident report", ""]
    if report.generated_at:
        lines.append(f"Generated {report.generated_at.isoformat()}" + (" — REDACTED" if report.redacted else ""))
        lines.append("")
    for section in report.sections:
        lines += [f"## {section.title}", ""]
        if not section.statements:
            lines += ["_None._", ""]
            continue
        for st in section.statements:
            refs = list(dict.fromkeys([*st.evidence_ids, *st.claim_ids, *st.event_ids, *st.item_ids]))
            if refs:
                shown = ", ".join(refs[:10]) + (f" +{len(refs) - 10}" if len(refs) > 10 else "")
                lines.append(f"- {st.text} _[{shown}]_")
            else:
                lines.append(f"- {st.text}")
        lines.append("")
    return "\n".join(lines)
