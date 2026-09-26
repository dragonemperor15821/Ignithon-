"""Missing-information analysis: what the evidence does NOT state.

Rules:
- Each item describes a gap; the missing value is never guessed or filled in.
- Gaps are judged per claim (the same sentence), matching how the timeline
  places events. A date written elsewhere in the document is not borrowed.
- Every item references its evidence and, where there is one, the claim and
  timeline event it concerns.
"""

import re

from app.claim_facts import ClaimFacts, all_facts
from app.models import Evidence, ExtractionResult, MissingInfoItem, Timeline

SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}

PAYMENT_CONTEXT = re.compile(
    r"\b(?:payments?|paid|pay|transfer(?:red)?|debited|credited|deducted|refund(?:ed)?)\b"
    r"|\btransactions?\b(?!\s*(?:id|no|number|ref))",
    re.I,
)
# A number that looks like money but has no currency marker (e.g. '25,000' after OCR lost the '₹').
BARE_NUMBER = re.compile(r"(?<![\w.:/-])(?:\d{1,3}(?:,\d{2,3})+|\d{4,})(?:\.\d{1,2})?(?![\w:/-])")
RELATIVE_TIME = re.compile(
    r"\b(?:later|afterwards?|after that|subsequently|earlier|previously|before that|then|next day|"
    r"yesterday|today|tomorrow|recently|soon after)\b",
    re.I,
)
NEGATED = re.compile(r"\b(?:no|not|never|den(?:y|ied|ies))\b|n't\b", re.I)
REQUEST = re.compile(r"\b(?:request|ask|demand|pay|send)\w*", re.I)
UNIDENTIFIED_ACTOR = re.compile(
    r"\b(?:unknown|unidentified|anonymous)\s+(?:sender|caller|number|person|account|user)\b"
    r"|\b(?:the|same|a)\s+(?:sender|caller|scammer|fraudster)\b",
    re.I,
)


def _raw_values(facts: ClaimFacts, *types: str) -> list[str]:
    return [e.raw for e in facts.entities if e.type in types]


def _uncovered_numbers(facts: ClaimFacts) -> list[str]:
    spans = [(e.char_start, e.char_end) for e in facts.entities]
    return [
        m.group()
        for m in BARE_NUMBER.finditer(facts.claim.claim)
        if not any(s < m.end() and m.start() < e for s, e in spans)
    ]


def detect(
    evidence: list[Evidence], extractions: list[ExtractionResult], timeline: Timeline
) -> list[tuple[str, MissingInfoItem]]:
    """Return (stable key, item) pairs with empty IDs, in presentation order."""
    by_evidence = {r.evidence_id: r for r in extractions}
    event_of: dict[str, list[str]] = {}
    for event in timeline.events:
        for cid in event.source_claim_ids:
            event_of.setdefault(cid, []).append(event.id)

    found: list[tuple[str, MissingInfoItem]] = []

    def add(category, severity, description, evidence_id, facts: ClaimFacts | None = None, detail="", claims=None):
        claims = claims or ([facts] if facts else [])
        claim_ids = [f.claim.id for f in claims]
        key = "|".join([category, evidence_id, ",".join(claim_ids), detail])
        found.append(
            (
                key,
                MissingInfoItem(
                    id="",
                    category=category,
                    description=description,
                    severity=severity,
                    source_evidence_ids=[evidence_id],
                    source_claim_ids=claim_ids,
                    timeline_event_ids=sorted({e for cid in claim_ids for e in event_of.get(cid, [])}),
                    supporting_text=claims[0].claim.claim if claims else None,
                ),
            )
        )

    # Evidence that produced no claims at all.
    for ev in sorted(evidence, key=lambda e: e.id):
        result = by_evidence.get(ev.id)
        if result is None:
            add("not_analyzed", "medium", f"{ev.filename} has not been analyzed; its contents are unknown", ev.id)
        elif result.status != "extracted":
            reason = result.notes[0] if result.notes else result.status
            add("unreadable_evidence", "high", f"No text could be read from {ev.filename}: {reason}", ev.id)

    facts = all_facts(extractions)
    per_evidence: dict[str, list[ClaimFacts]] = {}
    for f in facts:
        per_evidence.setdefault(f.evidence_id, []).append(f)

    for f in facts:
        text, ev = f.claim.claim, f.evidence_id
        is_event = f.has("time", "date", "amount")

        for e in f.entities:
            if e.type == "date" and e.normalized is None:
                add(
                    "unresolved_date",
                    "high" if is_event else "medium",
                    f"Date written as '{e.raw}' was not resolved to a calendar date; "
                    "numeric dates are not normalized because the day/month order is not stated",
                    ev, f, detail=e.raw,
                )

        if f.has("amount") and not f.has("date", "time"):
            add("missing_timestamp", "high", "An amount is stated with no date or time in the same statement", ev, f)
        elif f.has("time") and not f.has("date"):
            times = ", ".join(_raw_values(f, "time"))
            add("missing_date", "medium", f"Time {times} is stated without a date in the same statement", ev, f)
        elif f.has("date") and not f.has("time") and f.has("amount"):
            add("missing_time", "low", "A dated transaction is stated without a time", ev, f)

        # A sentence denying a payment has no amount to be missing.
        payment = PAYMENT_CONTEXT.search(text) and not NEGATED.search(text)
        if payment and not f.has("amount"):
            numbers = _uncovered_numbers(f)
            if numbers:
                add(
                    "missing_currency",
                    "medium",
                    f"Number(s) {', '.join(repr(n) for n in numbers)} appear in a payment statement without a "
                    "currency marker, so they are not treated as amounts",
                    ev, f, detail=",".join(numbers),
                )
            else:
                add("missing_amount", "medium", "A payment is mentioned but no readable amount is stated", ev, f)

        if not f.has("date", "time") and (m := RELATIVE_TIME.search(text)) and (f.predicates or f.has("amount")):
            add(
                "unplaced_event",
                "medium",
                f"Event is described with a relative time ('{m.group()}') and no stated date or time, "
                "so it cannot be placed on the timeline",
                ev, f,
            )

    for ev, claims in sorted(per_evidence.items()):
        # Amounts that were only asked for have no transaction reference to be missing.
        payments = [
            c
            for c in claims
            if c.predicates.get("payment_made") or (c.has("amount") and not REQUEST.search(c.claim.claim))
        ]
        if payments and not any(c.has("transaction_id") for c in claims):
            add(
                "missing_transaction_id",
                "medium",
                "Payments are described but no transaction/reference ID is stated anywhere in this evidence",
                ev, claims=payments,
            )

        mentions = [c for c in claims if UNIDENTIFIED_ACTOR.search(c.claim.claim)]
        if mentions and not any(c.has("actor") for c in claims):
            add(
                "unidentified_actor",
                "medium",
                "A sender/caller is referred to, but no phone number or email address identifying them is "
                "stated anywhere in this evidence",
                ev, claims=mentions,
            )

    claim_seq = {f.claim.id: f.seq for f in facts}
    found.sort(
        key=lambda kv: (
            SEVERITY_RANK[kv[1].severity],
            kv[1].source_evidence_ids[0],
            min((claim_seq[c] for c in kv[1].source_claim_ids), default=0),
            kv[1].category,
            kv[0],
        )
    )
    return found
