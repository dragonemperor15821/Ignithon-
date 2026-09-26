"""What each claim literally states, in a form the analyses can compare.

Shared by missing-information and contradiction analysis. Nothing here infers a
value: facts are the entities written in the claim and the actions it affirms or
denies.

Entities are re-detected on the claim text itself. The extractor reports a value
repeated within one document only once, so a claim that restates e.g. '10:42 AM'
can carry no entity for it even though the time is written in that sentence.
"""

import re
from dataclasses import dataclass, field

from app.extraction import find_entities
from app.models import Claim, ExtractedEntity, ExtractionResult

# Actions an incident claim can affirm or deny: name -> (objects, verbs, description).
# A claim asserts the action when it names both an object and a verb.
PREDICATES: dict[str, tuple[str, str, str]] = {
    "payment_requested": (
        r"payments?|money|funds|transfers?|amount",
        r"request(?:ed|s|ing)?|ask(?:ed|s|ing)?|demand(?:ed|s|ing)?",
        "a payment was requested",
    ),
    "payment_made": (
        r"payments?|money|funds|transfers?|transactions?",
        r"paid|made|transferred|debited|deducted|recorded|completed|processed",
        "a payment was made",
    ),
    "credentials_shared": (
        r"otp|password|pin|cvv|credentials?|(?:bank(?:ing)?|card|account|login) details",
        r"shared?|entered|gave|given|provided|disclosed|typed",
        "credentials were shared",
    ),
    "link_clicked": (r"links?|url", r"clicked|opened|visited", "the link was opened"),
}

NEGATION = r"(?:\bnot|\bnever|n't)\s+(?:\w+\s+){{0,3}}(?:{verbs})\b"
NO_OBJECT = r"\bno\s+(?:\w+\s+){{0,2}}(?:{objects})\b"
DENIAL = r"\bden(?:y|ied|ies|ying)\b\s+(?:\w+\s+){{0,3}}(?:{objects}|{verbs})\b"


def _polarity(text: str, objects: str, verbs: str) -> bool | None:
    """True if the claim affirms the action, False if it denies it, None if it does not mention it.

    An infinitive ("asked me to share the OTP") describes a request, not the action itself."""
    stated = [m for m in re.finditer(rf"\b(?:{verbs})\b", text) if not re.search(r"\bto\s+$", text[: m.start()])]
    if not (re.search(rf"\b(?:{objects})\b", text) and stated):
        return None
    for pattern in (NO_OBJECT, NEGATION, DENIAL):
        if re.search(pattern.format(objects=objects, verbs=verbs), text):
            return False
    return True


def _value(entity: ExtractedEntity) -> str:
    return (entity.normalized or entity.raw).strip().lower()


@dataclass
class ClaimFacts:
    claim: Claim
    evidence_id: str
    entities: list[ExtractedEntity]
    predicates: dict[str, bool]  # name -> affirmed (True) / denied (False)
    template: str  # claim wording with the stated values blanked out
    values: dict[str, set[str]] = field(default_factory=dict)  # amount/date/time/transaction_id/actor
    linked: "ClaimFacts | None" = None  # adjacent sentence this one unambiguously shares a transaction with

    @property
    def seq(self) -> int:
        return int(self.claim.id.rsplit("-", 1)[1])

    def has(self, *kinds: str) -> bool:
        return any(self.values.get(k) for k in kinds)

    def context(self, kind: str) -> set[str]:
        """Values this claim states, or - if it states none - those of its linked adjacent sentence."""
        if self.values[kind] or self.linked is None:
            return self.values[kind]
        return self.linked.values[kind]


def _template(text: str, entities: list[ExtractedEntity]) -> str:
    parts, pos = [], 0
    for e in sorted(entities, key=lambda e: e.char_start):
        parts += [text[pos : e.char_start], f" <{e.type}> "]
        pos = e.char_end
    parts.append(text[pos:])
    words = re.sub(r"[^\w<>]+", " ", "".join(parts).lower()).split()
    if words and words[0].isdigit():
        words = words[1:]  # line number captured by OCR from an editor screenshot
    return " ".join(words)


def facts_for(claim: Claim, evidence_id: str) -> ClaimFacts:
    text = claim.claim
    entities = find_entities(text, evidence_id)
    lowered = text.lower()
    predicates = {
        name: polarity
        for name, (objects, verbs, _) in PREDICATES.items()
        if (polarity := _polarity(lowered, objects, verbs)) is not None
    }
    values: dict[str, set[str]] = {k: set() for k in ("amount", "date", "time", "transaction_id", "actor")}
    for e in entities:
        if e.type == "datetime" and e.normalized:
            date, time = e.normalized.split("T")
            values["date"].add(date)
            values["time"].add(time[:5])
        elif e.type in ("amount", "date", "time", "transaction_id"):
            values[e.type].add(_value(e))
        elif e.type in ("email_address", "phone_number"):
            values["actor"].add(_value(e))
    return ClaimFacts(claim, evidence_id, entities, predicates, _template(text, entities), values)


def _adjacent(text: str, a: ClaimFacts, b: ClaimFacts) -> bool:
    """b directly follows a: nothing between them but spaces and at most one line break."""
    if a.claim.char_end is None or b.claim.char_start is None:
        return False
    gap = text[a.claim.char_end : b.claim.char_start]
    return not gap.strip() and gap.count("\n") <= 1


def _link(text: str, claims: list[ClaimFacts]) -> None:
    """Pair a sentence stating only a transaction ID with the adjacent sentence stating only an amount
    (e.g. "Rs 52,000 debited on ... 10:55. UTR 412345678901."). Ambiguous cases are left unlinked."""
    def txn_only(f):
        return len(f.values["transaction_id"]) == 1 and not f.values["amount"]

    def amount_only(f):
        return len(f.values["amount"]) == 1 and not f.values["transaction_id"]

    proposals: list[tuple[ClaimFacts, ClaimFacts]] = []
    for i, f in enumerate(claims):
        if not txn_only(f):
            continue
        neighbours = []
        if i > 0 and amount_only(claims[i - 1]) and _adjacent(text, claims[i - 1], f):
            neighbours.append(claims[i - 1])
        if i + 1 < len(claims) and amount_only(claims[i + 1]) and _adjacent(text, f, claims[i + 1]):
            neighbours.append(claims[i + 1])
        if len(neighbours) == 1:  # both sides qualify -> ambiguous, no link
            proposals.append((f, neighbours[0]))
    targets = [id(a) for _, a in proposals]
    for t, a in proposals:
        if targets.count(id(a)) == 1:  # one amount claimed by two ID sentences -> ambiguous
            t.linked, a.linked = a, t


def all_facts(extractions: list[ExtractionResult]) -> list[ClaimFacts]:
    """Facts for every claim of every successful extraction, in evidence then claim order."""
    facts = []
    for result in sorted(extractions, key=lambda r: r.evidence_id):
        if result.status != "extracted":
            continue
        claims = [facts_for(c, result.evidence_id) for c in sorted(result.claims, key=lambda c: (c.char_start or 0, c.id))]
        _link(result.extracted_text or "", claims)
        facts += claims
    return facts
