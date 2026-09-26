from datetime import datetime
from typing import Literal

from pydantic import BaseModel

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
