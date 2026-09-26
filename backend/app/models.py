from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, computed_field

EvidenceType = Literal["image", "pdf", "text", "csv", "json", "document"]
EvidenceStatus = Literal["pending", "processing", "processed", "failed"]


class Evidence(BaseModel):
    id: str
    filename: str
    stored_filename: str
    type: EvidenceType
    mime_type: str
    size: int
    sha256: str
    uploaded_at: datetime
    status: EvidenceStatus = "pending"


class RejectedFile(BaseModel):
    filename: str
    reason: str


class UploadResponse(BaseModel):
    created: list[Evidence]
    rejected: list[RejectedFile]


# ---------------------------------------------------------------------------
# Information extraction
#
# Evidence -> ExtractionResult -> Claim[] -> TimelineEvent[]
# Extraction only reports what the evidence text contains. Nothing is inferred,
# and nothing here says whether a claim is true.
# ---------------------------------------------------------------------------

EntityType = Literal[
    "datetime", "date", "time", "amount", "url", "transaction_id", "phone_number", "email_address"
]
ExtractionStatus = Literal["extracted", "no_text", "unavailable", "failed"]


class ExtractedEntity(BaseModel):
    id: str
    type: EntityType
    raw: str  # exactly as it appears in the evidence text
    normalized: str | None = None  # None when normalizing would require guessing
    unit: str | None = None  # e.g. "INR" for amounts, only when stated in the text
    source_evidence_ids: list[str] = Field(min_length=1)
    confidence: float
    char_start: int
    char_end: int


class Claim(BaseModel):
    """A statement found verbatim in the evidence.

    `confidence` is how reliably the text was captured from the source
    (e.g. plain text > PDF text layer > OCR), not whether the statement is true.
    """

    id: str
    claim: str
    source_evidence_ids: list[str] = Field(min_length=1)
    confidence: float
    entity_ids: list[str] = []
    char_start: int | None = None
    char_end: int | None = None


class ExtractionResult(BaseModel):
    evidence_id: str
    status: ExtractionStatus
    method: str | None = None
    extracted_text: str | None = None  # None means text is unavailable, not empty
    ocr_raw_text: str | None = None  # OCR only: recognizer output before spacing/digit repairs
    text_truncated: bool = False
    entities: list[ExtractedEntity] = []
    claims: list[Claim] = []
    confidence: float | None = None
    notes: list[str] = []
    extracted_at: datetime

    def _of(self, *types: str) -> list[ExtractedEntity]:
        return [e for e in self.entities if e.type in types]

    @computed_field
    @property
    def timestamps(self) -> list[ExtractedEntity]:
        return self._of("datetime", "date", "time")

    @computed_field
    @property
    def amounts(self) -> list[ExtractedEntity]:
        return self._of("amount")

    @computed_field
    @property
    def urls(self) -> list[ExtractedEntity]:
        return self._of("url")

    @computed_field
    @property
    def transaction_ids(self) -> list[ExtractedEntity]:
        return self._of("transaction_id")

    @computed_field
    @property
    def phone_numbers(self) -> list[ExtractedEntity]:
        return self._of("phone_number")

    @computed_field
    @property
    def email_addresses(self) -> list[ExtractedEntity]:
        return self._of("email_address")


# ---------------------------------------------------------------------------
# Timeline
#
# Built only from saved extraction results. `date`/`time` are set only when the
# evidence states them explicitly and unambiguously; otherwise they stay None
# and the event is listed as undated. Conflicting timestamps are kept as-is.
# ---------------------------------------------------------------------------

TimelinePlacement = Literal["dated", "undated"]
TimelineStatus = Literal["pending", "ready", "empty"]


class TimelineEvent(BaseModel):
    id: str
    date: str | None = None  # ISO YYYY-MM-DD
    time: str | None = None  # 24h HH:MM[:SS]
    date_raw: str | None = None  # exactly as written in the evidence
    time_raw: str | None = None
    description: str  # verbatim claim text
    source_evidence_ids: list[str] = Field(min_length=1)
    source_claim_ids: list[str] = Field(min_length=1)
    entity_ids: list[str] = []
    entities: list[ExtractedEntity] = []
    placement: TimelinePlacement
    notes: list[str] = []


class Timeline(BaseModel):
    status: TimelineStatus
    generated_at: datetime | None = None
    extraction_count: int = 0
    events: list[TimelineEvent] = []  # dated (chronological) first, then undated by ID
    notes: list[str] = []


# ---------------------------------------------------------------------------
# Analysis layers derived from extractions + timeline. None of them edits the
# evidence or the extraction results; each keeps references to its sources.
# ---------------------------------------------------------------------------

AnalysisStatus = Literal["pending", "ready", "empty"]
Severity = Literal["high", "medium", "low"]

MissingCategory = Literal[
    "unresolved_date",
    "missing_date",
    "missing_time",
    "missing_timestamp",
    "missing_currency",
    "missing_amount",
    "missing_transaction_id",
    "unidentified_actor",
    "unplaced_event",
    "unreadable_evidence",
    "not_analyzed",
]


class MissingInfoItem(BaseModel):
    """A gap in what the evidence states. The missing value is never filled in."""

    id: str
    category: MissingCategory
    description: str
    severity: Severity
    status: Literal["open"] = "open"
    source_evidence_ids: list[str] = Field(min_length=1)
    source_claim_ids: list[str] = []
    timeline_event_ids: list[str] = []
    supporting_text: str | None = None  # verbatim claim text, when the gap is tied to a claim


class MissingInfoReport(BaseModel):
    status: AnalysisStatus
    generated_at: datetime | None = None
    extraction_count: int = 0
    items: list[MissingInfoItem] = []  # severity (high first), then evidence, then claim order
    notes: list[str] = []


ContradictionType = Literal[
    "affirmed_vs_denied",
    "conflicting_amount",
    "conflicting_date",
    "conflicting_time",
    "conflicting_transaction_id",
    "conflicting_actor",
]


class ClaimRef(BaseModel):
    claim_id: str
    evidence_id: str
    text: str  # verbatim claim text


class Contradiction(BaseModel):
    """Two claims that cannot both be literally true. Neither side is judged correct."""

    id: str
    type: ContradictionType
    explanation: str
    claim_a: ClaimRef  # representative of side A
    claim_b: ClaimRef  # representative of side B
    claims_a: list[ClaimRef] = []  # every claim on side A (equivalent conflicts are merged, not repeated)
    claims_b: list[ClaimRef] = []
    status: Literal["unresolved"] = "unresolved"


class ContradictionReport(BaseModel):
    status: AnalysisStatus
    generated_at: datetime | None = None
    claim_count: int = 0
    contradictions: list[Contradiction] = []
    notes: list[str] = []


RedactionType = Literal["email", "phone", "account", "card", "upi", "transaction_id", "government_id", "name", "address"]


class RedactionSpan(BaseModel):
    """Where a mask was applied, in the coordinates of the original extracted text.
    The masked value itself is never stored here."""

    type: RedactionType
    placeholder: str
    char_start: int
    char_end: int
    entity_id: str | None = None  # set when the span came from an extracted entity


class RedactedClaim(BaseModel):
    claim_id: str
    text: str


class RedactedEvidence(BaseModel):
    evidence_id: str
    source_sha256: str  # hash of the untouched original this derivative was made from
    status: Literal["redacted", "no_text", "unavailable"]
    redacted_text: str | None = None
    spans: list[RedactionSpan] = []
    claims: list[RedactedClaim] = []
    counts: dict[str, int] = {}
    notes: list[str] = []


class RedactionSet(BaseModel):
    status: AnalysisStatus
    generated_at: datetime | None = None
    items: list[RedactedEvidence] = []
    notes: list[str] = []


class ReportStatement(BaseModel):
    text: str
    evidence_ids: list[str] = []
    claim_ids: list[str] = []
    event_ids: list[str] = []
    item_ids: list[str] = []  # missing-information / contradiction IDs


class ReportSection(BaseModel):
    key: str
    title: str
    statements: list[ReportStatement] = []


class IncidentReport(BaseModel):
    status: AnalysisStatus
    generated_at: datetime | None = None
    redacted: bool = False
    sections: list[ReportSection] = []


# ---------------------------------------------------------------------------
# Case-level orchestration: one run of extraction -> timeline -> missing info ->
# contradictions -> redaction -> report, using the existing stage implementations.
# ---------------------------------------------------------------------------

CaseStage = Literal["extraction", "timeline", "missing_info", "contradictions", "redaction", "report"]
StageStatus = Literal["pending", "running", "completed", "failed", "skipped"]
CaseStatus = Literal["running", "completed", "completed_with_errors", "failed", "empty"]


class StageResult(BaseModel):
    status: StageStatus = "pending"
    duration_ms: int | None = None
    error: str | None = None
    # stage-specific counts (only the relevant ones are set)
    processed: int | None = None  # extraction: items (re-)analyzed in this run
    reused: int | None = None  # extraction: items already analyzed, left untouched
    failed: int | None = None  # extraction: items that could not be analyzed
    events: int | None = None  # timeline
    items: int | None = None  # missing info / contradictions / redaction
    masked: int | None = None  # redaction: identifiers masked
    statements: int | None = None  # report


class CaseError(BaseModel):
    stage: CaseStage
    evidence_id: str | None = None  # set for a single evidence item that failed; None for a stage failure
    message: str


class CaseAnalysis(BaseModel):
    status: CaseStatus
    started_at: datetime | None = None
    finished_at: datetime | None = None
    evidence_total: int = 0
    evidence_analyzed: int = 0  # items with readable text after this run
    evidence_by_type: dict[str, int] = {}
    stages: dict[str, StageResult] = {}  # in execution order
    errors: list[CaseError] = []


class CaseOverview(BaseModel):
    evidence_total: int
    evidence_by_type: dict[str, int]
    analyzed: int
    pending: int  # not analyzed yet, or a previous attempt was unavailable/failed
    last_run: CaseAnalysis | None = None
