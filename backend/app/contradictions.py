"""Contradiction detection across the claims of all evidence.

Rules:
- A contradiction is a set of claims that cannot all be literally true.
- Neither side is judged correct, and nothing is merged into a single "truth".
- Claims are only compared when they are clearly about the same thing:
  * some affirm an action (e.g. a payment was requested) and others deny it;
  * they refer to the same transaction ID but state different amounts/dates/times/parties
    (an adjacent sentence only counts when extraction linked it unambiguously);
  * they use the same wording and agree on at least one stated value, but differ in
    exactly one other (e.g. same time and wording, different amount).
- Equivalent conflicts are reported once, listing every claim on each side,
  instead of once per pair of claims.
"""

from dataclasses import dataclass, field
from itertools import combinations

from app.claim_facts import PREDICATES, ClaimFacts, all_facts
from app.models import ClaimRef, Contradiction, ContradictionType, ExtractionResult

VALUE_TYPE: dict[str, ContradictionType] = {
    "amount": "conflicting_amount",
    "date": "conflicting_date",
    "time": "conflicting_time",
    "transaction_id": "conflicting_transaction_id",
    "actor": "conflicting_actor",
}
SINGULAR = {"amount": "amount", "date": "date", "time": "time", "transaction_id": "transaction ID", "actor": "party"}
LABEL = {"amount": "amounts", "date": "dates", "time": "times", "transaction_id": "transaction IDs", "actor": "parties"}
TYPE_ORDER = ["affirmed_vs_denied", *VALUE_TYPE.values()]
MAX_IDS_IN_TEXT = 6


def _ref(f: ClaimFacts) -> ClaimRef:
    return ClaimRef(claim_id=f.claim.id, evidence_id=f.evidence_id, text=f.claim.claim)


def _ids(side: list[ClaimFacts]) -> str:
    ids = [f.claim.id for f in side]
    shown = ", ".join(ids[:MAX_IDS_IN_TEXT])
    return shown + (f" and {len(ids) - MAX_IDS_IN_TEXT} more" if len(ids) > MAX_IDS_IN_TEXT else "")


def _show(values: set[str]) -> str:
    return " / ".join(sorted(values))


@dataclass
class Cluster:
    kind: ContradictionType
    side_a: list[ClaimFacts] = field(default_factory=list)
    side_b: list[ClaimFacts] = field(default_factory=list)
    explanation: str = ""

    def members(self) -> frozenset[str]:
        return frozenset(f.claim.id for f in self.side_a + self.side_b)


def _value_cluster(kind_key: str, group: list[ClaimFacts], values, anchor: str) -> Cluster | None:
    """Split claims that state `kind_key` into side A (the first stated value) and side B (any other)."""
    stating = sorted((f for f in group if values(f)), key=lambda f: f.seq)
    distinct = {frozenset(values(f)) for f in stating}
    if len(distinct) < 2:
        return None
    first = frozenset(values(stating[0]))
    a = [f for f in stating if frozenset(values(f)) == first]
    b = [f for f in stating if frozenset(values(f)) != first]
    shown = " vs ".join(_show(set(v)) for v in sorted(distinct, key=sorted))
    return Cluster(
        VALUE_TYPE[kind_key], a, b,
        f"{anchor} state different {LABEL[kind_key]} ({shown}): {_ids(a)} vs {_ids(b)}. "
        "Both sides are kept; neither is treated as correct.",
    )


def detect(extractions: list[ExtractionResult]) -> list[tuple[str, Contradiction]]:
    """Return (stable key, contradiction) pairs with empty IDs, in presentation order."""
    facts = all_facts(extractions)
    clusters: dict[str, Cluster] = {}

    # 1. Affirmed vs denied action: one contradiction per contested action.
    for name, (_, _, description) in PREDICATES.items():
        affirmed = [f for f in facts if f.predicates.get(name) is True]
        denied = [f for f in facts if f.predicates.get(name) is False]
        if affirmed and denied:
            clusters[f"affirmed_vs_denied|{name}"] = Cluster(
                "affirmed_vs_denied", affirmed, denied,
                f"{_ids(affirmed)} state{'s' if len(affirmed) == 1 else ''} that {description}; "
                f"{_ids(denied)} state{'s' if len(denied) == 1 else ''} that it was not. "
                "Both statements are kept; neither is treated as correct.",
            )

    # 2. Same transaction ID (own or unambiguously linked adjacent sentence), different details.
    by_txn: dict[str, list[ClaimFacts]] = {}
    for f in facts:
        for txn in f.context("transaction_id"):
            by_txn.setdefault(txn, []).append(f)
    for txn, group in sorted(by_txn.items()):
        # a linked pair describes one transaction statement; keep the sentence that carries the ID
        group = [f for f in group if f.values["transaction_id"] or f.linked not in group]
        for kind in ("amount", "date", "time", "actor"):
            cluster = _value_cluster(
                kind, group, lambda f, k=kind: f.context(k), f"Claims referring to transaction {txn.upper()}"
            )
            if cluster:
                clusters[f"{cluster.kind}|txn|{txn}"] = cluster

    # 3. Same wording, at least one agreeing value, exactly one differing value.
    by_template: dict[str, list[ClaimFacts]] = {}
    for f in facts:
        if any(f.values.values()):
            by_template.setdefault(f.template, []).append(f)
    for template, group in sorted(by_template.items()):
        pending: dict[str, list[ClaimFacts]] = {}
        for a, b in combinations(group, 2):
            stated = [k for k in VALUE_TYPE if a.values[k] and b.values[k]]
            differing = [k for k in stated if a.values[k] != b.values[k]]
            if len(differing) == 1 and len(stated) > 1:
                kind = differing[0]
                agreeing = tuple((k, _show(a.values[k])) for k in stated if k != kind)
                key = f"{VALUE_TYPE[kind]}|wording|{template}|{agreeing}"
                members = pending.setdefault(key, [])
                members += [f for f in (a, b) if f not in members]
        for key, members in sorted(pending.items()):
            kind = next(k for k, v in VALUE_TYPE.items() if key.startswith(v + "|"))
            cluster = _value_cluster(kind, members, lambda f, k=kind: f.values[k], "Claims with the same wording")
            if cluster:
                clusters[key] = cluster

    # The same claims in conflict over the same thing are reported once.
    seen: set[tuple[str, frozenset[str]]] = set()
    unique: dict[str, Cluster] = {}
    for key, cluster in clusters.items():
        signature = (cluster.kind, cluster.members())
        if signature not in seen:
            seen.add(signature)
            unique[key] = cluster

    found = [
        (
            key,
            Contradiction(
                id="",
                type=c.kind,
                explanation=c.explanation,
                claim_a=_ref(c.side_a[0]),
                claim_b=_ref(c.side_b[0]),
                claims_a=[_ref(f) for f in c.side_a],
                claims_b=[_ref(f) for f in c.side_b],
            ),
        )
        for key, c in unique.items()
    ]
    seq = {f.claim.id: f.seq for f in facts}
    return sorted(
        found,
        key=lambda kv: (TYPE_ORDER.index(kv[1].type), seq[kv[1].claim_a.claim_id], seq[kv[1].claim_b.claim_id], kv[0]),
    )
