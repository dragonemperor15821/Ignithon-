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
