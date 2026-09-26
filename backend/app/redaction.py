"""Derived redaction of extracted text.

Rules:
- Only derived text (extracted text and claims) is redacted; original evidence
  files and the saved extraction results are never modified.
- Every occurrence is masked, not just the first one reported by extraction.
- Placeholders are fixed per type so output is deterministic and the sentence
  structure stays readable.
- The masked values are not stored anywhere in the redaction output.
"""

import re

from app.extraction import PATTERNS
from app.models import Evidence, ExtractionResult, RedactedClaim, RedactedEvidence, RedactionSpan

PLACEHOLDER = {
    "email": "[REDACTED_EMAIL]",
    "phone": "[REDACTED_PHONE]",
    "account": "[REDACTED_ACCOUNT]",
    "card": "[REDACTED_CARD]",
    "upi": "[REDACTED_UPI]",
    "transaction_id": "[REDACTED_TRANSACTION_ID]",
    "government_id": "[REDACTED_GOVERNMENT_ID]",
    "name": "[REDACTED_NAME]",
    "address": "[REDACTED_ADDRESS]",
}


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch) * (2 if i % 2 else 1)
        total += n - 9 if n > 9 else n
    return total % 10 == 0


def _extractor(etype: str):
    return [(p, norm) for t, p, _, norm in PATTERNS if t == etype]


# (redaction type, pattern, accept(raw) -> bool). Earlier rules win on overlap.
# A pattern with a named group 'v' masks only that group (e.g. keeps "Address:" and masks the value).
RULES = [
    ("address", re.compile(r"\baddress\s*[:\-]\s*(?P<v>[^\n]*\S)", re.I), None),
    (
        "name",
        re.compile(
            r"\b(?:Mr|Mrs|Ms|Miss|Dr|Shri|Smt)\.?\s+(?P<v>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})"
            r"|(?im:^[ \t]*(?:name|full name|account holder|beneficiary|payee|sender name)[ \t]*[:\-][ \t]*)"
            r"(?P<v2>[A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+){0,3})"
        ),
        None,
    ),
    *[("email", p, lambda raw, n=n: n(raw) is not None) for p, n in _extractor("email_address")],
    ("upi", re.compile(r"\b[\w.-]{2,}@[A-Za-z]{2,}\b(?!\.\w|[\w@-])"), None),
    ("card", re.compile(r"\b\d(?:[ -]?\d){12,18}\b"), lambda raw: _luhn(re.sub(r"\D", "", raw))),
    ("government_id", re.compile(r"\b\d{4}[ -]\d{4}[ -]\d{4}\b|\b[A-Z]{5}\d{4}[A-Z]\b"), None),
    (
        "account",
        re.compile(r"\b(?:a/c|acct|account)(?:\s*(?:no|number|#))?\.?\s*[:#-]?\s*(?P<v>[Xx*\d][Xx*\d -]{4,22}\d)\b", re.I),
        None,
    ),
    *[("transaction_id", p, lambda raw, n=n: n(raw) is not None) for p, n in _extractor("transaction_id")],
    *[("phone", p, lambda raw, n=n: n(raw) is not None) for p, n in _extractor("phone_number")],
    ("account", re.compile(r"(?<![\w.:/-])\d{9,18}(?![\w:/-])"), None),
]

def find_spans(text: str, entities=()) -> list[RedactionSpan]:
    # URLs themselves stay visible (investigative indicator); identifiers inside them are still masked.
    taken: list[tuple[int, int]] = []

    entity_at = {(e.char_start, e.char_end): e.id for e in entities}
    spans: list[RedactionSpan] = []
    for rtype, pattern, accept in RULES:
        for m in pattern.finditer(text):
            group = next((g for g in ("v", "v2") if g in pattern.groupindex and m.group(g) is not None), None)
            start, end = m.span(group) if group else m.span()
            if start == end or any(start < e and s < end for s, e in taken):
                continue
            if accept and not accept(text[start:end]):
                continue
            taken.append((start, end))
            spans.append(
                RedactionSpan(
                    type=rtype,
                    placeholder=PLACEHOLDER[rtype],
                    char_start=start,
                    char_end=end,
                    entity_id=entity_at.get((start, end)),
                )
            )
    return sorted(spans, key=lambda s: s.char_start)


def apply(text: str, spans: list[RedactionSpan], start: int = 0, end: int | None = None) -> str:
    """Redacted copy of text[start:end]; a span that is cut by the window is still masked."""
    end = len(text) if end is None else end
    out, pos = [], start
    for s in spans:
        if s.char_end <= start or s.char_start >= end:
            continue
        out += [text[pos : max(s.char_start, start)], s.placeholder]
        pos = min(s.char_end, end)
    out.append(text[pos:end])
    return "".join(out)


def redact(evidence: Evidence, result: ExtractionResult | None) -> RedactedEvidence:
    base = {"evidence_id": evidence.id, "source_sha256": evidence.sha256}
    if result is None or result.extracted_text is None:
        note = "Not analyzed yet" if result is None else (result.notes[0] if result.notes else "Text unavailable")
        return RedactedEvidence(**base, status="unavailable", notes=[note])
    text = result.extracted_text
    if not text.strip():
        return RedactedEvidence(**base, status="no_text", redacted_text=text, notes=["No text to redact"])

    spans = find_spans(text, result.entities)
    counts: dict[str, int] = {}
    for s in spans:
        counts[s.type] = counts.get(s.type, 0) + 1
    claims = [
        RedactedClaim(
            claim_id=c.id,
            text=apply(text, spans, c.char_start, c.char_end) if c.char_start is not None else c.claim,
        )
        for c in result.claims
    ]
    notes = [] if spans else ["No sensitive identifiers detected"]
    return RedactedEvidence(
        **base, status="redacted", redacted_text=apply(text, spans), spans=spans, claims=claims,
        counts=dict(sorted(counts.items())), notes=notes,
    )
