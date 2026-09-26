export type EvidenceType = "image" | "pdf" | "text" | "csv" | "json" | "document";
export type EvidenceStatus = "pending" | "processing" | "processed" | "failed";

export interface Evidence {
  id: string;
  filename: string;
  stored_filename: string;
  type: EvidenceType;
  mime_type: string;
  size: number;
  sha256: string;
  uploaded_at: string;
  status: EvidenceStatus;
}

export interface RejectedFile {
  filename: string;
  reason: string;
}

export interface UploadResponse {
  created: Evidence[];
  rejected: RejectedFile[];
}

export type EntityType =
  | "datetime"
  | "date"
  | "time"
  | "amount"
  | "url"
  | "transaction_id"
  | "phone_number"
  | "email_address";
export type ExtractionStatus = "extracted" | "no_text" | "unavailable" | "failed";

export interface ExtractedEntity {
  id: string;
  type: EntityType;
  raw: string;
  normalized: string | null;
  unit: string | null;
  source_evidence_ids: string[];
  confidence: number;
  char_start: number;
  char_end: number;
}

export interface Claim {
  id: string;
  claim: string;
  source_evidence_ids: string[];
  confidence: number;
  entity_ids: string[];
  char_start: number | null;
  char_end: number | null;
}

export interface ExtractionResult {
  evidence_id: string;
  status: ExtractionStatus;
  method: string | null;
  extracted_text: string | null;
  text_truncated: boolean;
  entities: ExtractedEntity[];
  claims: Claim[];
  confidence: number | null;
  notes: string[];
  extracted_at: string;
  timestamps: ExtractedEntity[];
  amounts: ExtractedEntity[];
  urls: ExtractedEntity[];
  transaction_ids: ExtractedEntity[];
  phone_numbers: ExtractedEntity[];
  email_addresses: ExtractedEntity[];
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : `${fallback} (HTTP ${res.status})`;
}

export async function listExtractions(): Promise<ExtractionResult[]> {
  const res = await fetch("/api/extractions");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load extractions"));
  return res.json();
}

export async function extractEvidence(id: string): Promise<ExtractionResult> {
  const res = await fetch(`/api/evidence/${encodeURIComponent(id)}/extract`, { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Extraction failed"));
  return res.json();
}

export async function runAllExtractions(): Promise<ExtractionResult[]> {
  const res = await fetch("/api/extraction/run", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Extraction run failed"));
  return res.json();
}

export const ACCEPTED_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.json,.doc,.docx";

export async function listEvidence(): Promise<Evidence[]> {
  const res = await fetch("/api/evidence");
  if (!res.ok) throw new Error(`Failed to load evidence (HTTP ${res.status})`);
  return res.json();
}

export async function uploadEvidence(files: File[]): Promise<UploadResponse> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch("/api/evidence/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const rejected: RejectedFile[] = detail?.rejected ?? [];
    const reasons = rejected.map((r) => `${r.filename}: ${r.reason}`).join("; ");
    const message =
      typeof detail === "string" ? detail : detail?.message ?? `Upload failed (HTTP ${res.status})`;
    throw new Error(reasons ? `${message} — ${reasons}` : message);
  }
  return body as UploadResponse;
}
