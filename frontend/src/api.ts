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
  ocr_raw_text?: string | null;
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

export type TimelineStatus = "pending" | "ready" | "empty";

export interface TimelineEvent {
  id: string;
  date: string | null;
  time: string | null;
  date_raw: string | null;
  time_raw: string | null;
  description: string;
  source_evidence_ids: string[];
  source_claim_ids: string[];
  entity_ids: string[];
  entities: ExtractedEntity[];
  placement: "dated" | "undated";
  notes: string[];
}

export interface Timeline {
  status: TimelineStatus;
  generated_at: string | null;
  extraction_count: number;
  events: TimelineEvent[];
  notes: string[];
}

export async function getTimeline(): Promise<Timeline> {
  const res = await fetch("/api/timeline");
  if (!res.ok) throw new Error(await errorMessage(res, "Failed to load timeline"));
  return res.json();
}

export async function runTimeline(): Promise<Timeline> {
  const res = await fetch("/api/timeline/run", { method: "POST" });
  if (!res.ok) throw new Error(await errorMessage(res, "Timeline build failed"));
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

// ---------------------------------------------------------------------------
// Analysis layers: missing information, contradictions, redaction, report
// ---------------------------------------------------------------------------

export type AnalysisStatus = "pending" | "ready" | "empty";
export type Severity = "high" | "medium" | "low";

export interface MissingInfoItem {
  id: string;
  category: string;
  description: string;
  severity: Severity;
  status: "open";
  source_evidence_ids: string[];
  source_claim_ids: string[];
  timeline_event_ids: string[];
  supporting_text: string | null;
}

export interface MissingInfoReport {
  status: AnalysisStatus;
  generated_at: string | null;
  extraction_count: number;
  items: MissingInfoItem[];
  notes: string[];
}

export interface ClaimRef {
  claim_id: string;
  evidence_id: string;
  text: string;
}

export interface Contradiction {
  id: string;
  type: string;
  explanation: string;
  claim_a: ClaimRef;
  claim_b: ClaimRef;
  claims_a: ClaimRef[];
  claims_b: ClaimRef[];
  status: "unresolved";
}

export interface ContradictionReport {
  status: AnalysisStatus;
  generated_at: string | null;
  claim_count: number;
  contradictions: Contradiction[];
  notes: string[];
}

export interface RedactedEvidence {
  evidence_id: string;
  source_sha256: string;
  status: "redacted" | "no_text" | "unavailable";
  redacted_text: string | null;
  spans: { type: string; placeholder: string; char_start: number; char_end: number; entity_id: string | null }[];
  claims: { claim_id: string; text: string }[];
  counts: Record<string, number>;
  notes: string[];
}

export interface RedactionSet {
  status: AnalysisStatus;
  generated_at: string | null;
  items: RedactedEvidence[];
  notes: string[];
}

export interface ReportStatement {
  text: string;
  evidence_ids: string[];
  claim_ids: string[];
  event_ids: string[];
  item_ids: string[];
}

export interface IncidentReport {
  status: AnalysisStatus;
  generated_at: string | null;
  redacted: boolean;
  sections: { key: string; title: string; statements: ReportStatement[] }[];
}

async function getJson<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await errorMessage(res, fallback));
  return res.json();
}

const POST = { method: "POST" };

export const getMissingInfo = () => getJson<MissingInfoReport>("/api/missing-info", "Failed to load missing information");
export const runMissingInfo = () =>
  getJson<MissingInfoReport>("/api/missing-info/run", "Missing-information analysis failed", POST);

export const getContradictions = () => getJson<ContradictionReport>("/api/contradictions", "Failed to load contradictions");
export const runContradictions = () =>
  getJson<ContradictionReport>("/api/contradictions/run", "Contradiction analysis failed", POST);

export const getRedactions = () => getJson<RedactionSet>("/api/redactions", "Failed to load redactions");
export const runRedactions = () => getJson<RedactionSet>("/api/redactions/run", "Redaction failed", POST);

export const getReport = (redacted: boolean) =>
  getJson<IncidentReport>(`/api/report?redacted=${redacted}`, "Failed to load report");
export const generateReport = (redacted: boolean) =>
  getJson<IncidentReport>(`/api/report/generate?redacted=${redacted}`, "Report generation failed", POST);
export const reportMarkdownUrl = (redacted: boolean) => `/api/report/markdown?redacted=${redacted}`;

// ---------------------------------------------------------------------------
// Case-level analysis (one click: extraction -> timeline -> gaps -> contradictions -> redaction -> report)
// ---------------------------------------------------------------------------

export type CaseStageName = "extraction" | "timeline" | "missing_info" | "contradictions" | "redaction" | "report";
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type CaseStatus = "running" | "completed" | "completed_with_errors" | "failed" | "empty";

export interface StageResult {
  status: StageStatus;
  duration_ms: number | null;
  error: string | null;
  processed: number | null;
  reused: number | null;
  failed: number | null;
  events: number | null;
  items: number | null;
  masked: number | null;
  statements: number | null;
}

export interface CaseError {
  stage: CaseStageName;
  evidence_id: string | null;
  message: string;
}

export interface CaseAnalysis {
  status: CaseStatus;
  started_at: string | null;
  finished_at: string | null;
  evidence_total: number;
  evidence_analyzed: number;
  evidence_by_type: Record<string, number>;
  stages: Record<CaseStageName, StageResult>;
  errors: CaseError[];
}

export interface CaseOverview {
  evidence_total: number;
  evidence_by_type: Record<string, number>;
  analyzed: number;
  pending: number;
  last_run: CaseAnalysis | null;
}

export type CaseEvent =
  | { event: "stage"; stage: CaseStageName; label: string; result: StageResult }
  | { event: "done"; result: CaseAnalysis }
  | { event: "error"; message: string };

export const getCaseOverview = () => getJson<CaseOverview>("/api/case", "Failed to load case overview");

/** Run the whole case, reporting each stage as it starts/finishes. Resolves with the final result. */
export async function analyzeCase(onEvent: (e: CaseEvent) => void): Promise<CaseAnalysis> {
  const res = await fetch("/api/case/analyze/stream", { method: "POST" });
  if (!res.ok || !res.body) throw new Error(await errorMessage(res, "Case analysis failed"));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: CaseAnalysis | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as CaseEvent;
      onEvent(event);
      if (event.event === "done") final = event.result;
      if (event.event === "error") throw new Error(event.message);
    }
    if (done) break;
  }
  if (!final) throw new Error("Case analysis ended without a result");
  return final;
}
