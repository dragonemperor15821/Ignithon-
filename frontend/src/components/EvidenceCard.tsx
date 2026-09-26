import { useEffect, useState } from "react";
import {
  deleteEvidence,
  extractEvidence,
  verifyIntegrity,
  type Evidence,
  type ExtractionResult,
  type ExtractionStatus,
  type IntegrityResult,
} from "../api";
import ExtractionDetails from "./ExtractionDetails";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  CrossIcon,
  FileIcon,
  ShieldCheckIcon,
} from "./Icons";

const STATUS_BADGE: Record<Evidence["status"], { label: string; style: string }> = {
  pending: { label: "Pending Analysis", style: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  processing: { label: "Processing…", style: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  processed: { label: "Registered", style: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  failed: { label: "Failed", style: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
};

const EXTRACTION_BADGE: Record<ExtractionStatus, { label: string; style: string }> = {
  extracted: { label: "Analyzed & Extracted", style: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  no_text: { label: "No Text Found", style: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  unavailable: { label: "Text Unavailable", style: "bg-slate-800 text-slate-400 border-slate-700" },
  failed: { label: "Extraction Error", style: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  evidence: Evidence;
  extraction?: ExtractionResult;
  onExtracted: (result: ExtractionResult) => void;
  onDeleted?: (evidenceId: string) => void;
}

export default function EvidenceCard({ evidence, extraction, onExtracted, onDeleted }: Props) {
  const [expandedHash, setExpandedHash] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEvidence(evidence.id);
      onDeleted?.(evidence.id); // only after the backend confirmed the deletion
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    verifyIntegrity(evidence.id).then(setIntegrity).catch(() => setIntegrity(null));
  }, [evidence.id, evidence.sha256]);

  async function analyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      onExtracted(await extractEvidence(evidence.id));
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const badge = extraction
    ? EXTRACTION_BADGE[extraction.status]
    : STATUS_BADGE[evidence.status];

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(evidence.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExpandedHash(true);
    }
  }

  return (
    <article
      id={`evidence-${evidence.id}`}
      className={`group scroll-mt-6 rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 sm:p-5 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/60 shadow-lg ${
        showDetails ? "sm:col-span-2 lg:col-span-3 border-emerald-500/40 bg-slate-900/80" : ""
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-xs font-bold text-emerald-400">
            {evidence.id}
          </span>
          <div className="min-w-0">
            <h3
              className="truncate text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition"
              title={evidence.filename}
            >
              {evidence.filename}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1 font-mono uppercase text-slate-400">
                <FileIcon className="h-3 w-3 text-cyan-400" />
                {evidence.type}
              </span>
              <span>·</span>
              <span className="font-mono text-slate-400">{formatSize(evidence.size)}</span>
              <span>·</span>
              <span className="text-slate-400">
                {new Date(evidence.uploaded_at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.style}`}
        >
          {badge.label}
        </span>
      </div>

      {/* SHA-256 Cryptographic Checksum Bar */}
      <div className="mt-3.5 rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex items-center gap-1.5 text-slate-400"
            title={
              integrity
                ? `Re-hashed ${new Date(integrity.checked_at).toLocaleString()}${integrity.detail ? ` — ${integrity.detail}` : ""}`
                : "Re-hashing stored original…"
            }
          >
            {integrity?.status === "INTEGRITY VIOLATION" ? (
              <CrossIcon className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <ShieldCheckIcon className={`h-3.5 w-3.5 ${integrity ? "text-emerald-400" : "text-slate-500"}`} />
            )}
            <span
              className={`text-[10px] font-bold tracking-wider uppercase ${
                !integrity ? "text-slate-500" : integrity.status === "VERIFIED" ? "text-emerald-400/90" : "text-rose-400"
              }`}
            >
              {!integrity ? "VERIFYING SHA-256…" : integrity.status === "VERIFIED" ? "VERIFIED" : "INTEGRITY VIOLATION"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <button
              onClick={() => setExpandedHash((v) => !v)}
              className="text-slate-400 hover:text-slate-200 transition"
            >
              {expandedHash ? "truncate" : "view full"}
            </button>
            <button
              onClick={copyHash}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-slate-300 hover:bg-slate-700 hover:text-emerald-300 transition"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-2.5 w-2.5 text-emerald-400" />
                  <span className="text-emerald-300">copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-2.5 w-2.5" />
                  <span>copy</span>
                </>
              )}
            </button>
          </div>
        </div>
        <code className={`mt-1 block font-mono text-slate-300 text-[10px] ${expandedHash ? "break-all" : "truncate"}`}>
          {expandedHash ? evidence.sha256 : `${evidence.sha256.slice(0, 18)}…${evidence.sha256.slice(-10)}`}
        </code>
      </div>

      {/* Extraction Metrics Row (if analyzed) */}
      {extraction && (
        <div className="mt-3.5 pt-3 border-t border-slate-800/80">
          {extraction.status === "extracted" || extraction.status === "no_text" ? (
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="rounded border border-slate-800/80 bg-slate-900/60 py-1.5">
                <div className="font-mono text-sm font-bold text-emerald-400">{extraction.claims.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Claims</div>
              </div>
              <div className="rounded border border-slate-800/80 bg-slate-900/60 py-1.5">
                <div className="font-mono text-sm font-bold text-cyan-400">{extraction.entities.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Entities</div>
              </div>
              <div className="rounded border border-slate-800/80 bg-slate-900/60 py-1.5">
                <div className="font-mono text-sm font-bold text-indigo-300">{extraction.timestamps.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Times</div>
              </div>
              <div className="rounded border border-slate-800/80 bg-slate-900/60 py-1.5">
                <div className="font-mono text-sm font-bold text-teal-300">{extraction.urls.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400">URLs</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              {extraction.notes[0] ?? "Text could not be extracted from this item."}
            </p>
          )}

          {extraction.method === "ocr" && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-cyan-400/90 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span>OCR RECOGNITION APPLIED (SOURCE IMAGE PRESERVED)</span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-800/80">
        <button
          onClick={analyze}
          disabled={analyzing}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-emerald-300 transition hover:bg-emerald-500/20 hover:border-emerald-400 disabled:cursor-wait disabled:opacity-60"
        >
          {analyzing ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
              <span>EXTRACTING…</span>
            </>
          ) : extraction ? (
            <span>RE-EXTRACT</span>
          ) : (
            <span>EXTRACT EVIDENCE</span>
          )}
        </button>

        {extraction && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition"
          >
            <span>{showDetails ? "Collapse" : "Details"}</span>
            {showDetails ? (
              <ChevronDownIcon className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>
        )}

        {onDeleted && (
          <button
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            disabled={deleting || confirmingDelete}
            title="Delete this evidence item and its stored file"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-rose-500/50 hover:text-rose-300 transition disabled:opacity-60"
          >
            <span>Delete</span>
          </button>
        )}
      </div>

      {confirmingDelete && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200">
          <span>
            Delete <span className="font-mono font-bold">{evidence.id}</span> ({evidence.filename}) permanently? Its stored
            file and extracted text are removed. Other evidence is not affected.
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-slate-300 hover:text-white transition disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={remove}
              disabled={deleting}
              className="rounded border border-rose-500/60 bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-200 hover:bg-rose-500/30 transition disabled:cursor-wait disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">
          <CrossIcon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      {analyzeError && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300">
          <CrossIcon className="h-3.5 w-3.5 text-rose-400 shrink-0" />
          <span>{analyzeError}</span>
        </div>
      )}

      {/* Progressive Disclosure Details */}
      {extraction && showDetails && (
        <div className="mt-4 animate-in fade-in duration-200">
          <ExtractionDetails result={extraction} />
        </div>
      )}
    </article>
  );
}

