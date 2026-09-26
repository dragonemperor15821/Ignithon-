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
# Evidence -> ExtractionResult -> Claim[] -> (future) TimelineEvent[]
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
