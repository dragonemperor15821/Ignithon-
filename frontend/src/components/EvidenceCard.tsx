import { useState } from "react";
import { extractEvidence, type Evidence, type ExtractionResult, type ExtractionStatus } from "../api";
import ExtractionDetails from "./ExtractionDetails";

const STATUS_STYLE: Record<Evidence["status"], string> = {
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  processing: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  processed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/40",
};

const EXTRACTION_BADGE: Record<ExtractionStatus, { label: string; style: string }> = {
  extracted: { label: "analyzed", style: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40" },
  no_text: { label: "no text", style: "bg-amber-500/10 text-amber-300 border-amber-500/40" },
  unavailable: { label: "text unavailable", style: "bg-slate-500/10 text-slate-300 border-slate-500/40" },
  failed: { label: "failed", style: "bg-rose-500/10 text-rose-300 border-rose-500/40" },
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
}

export default function EvidenceCard({ evidence, extraction, onExtracted }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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

  // Processing state comes from the extraction result; the registry record itself is never altered.
  const badge = extraction
    ? EXTRACTION_BADGE[extraction.status]
    : { label: evidence.status, style: STATUS_STYLE[evidence.status] };

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(evidence.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setExpanded(true); // clipboard unavailable: show the full hash so it can be selected
    }
  }

  return (
    <article
      id={`evidence-${evidence.id}`}
      className={`scroll-mt-4 rounded-lg border target:border-emerald-400 target:shadow-[0_0_24px_-8px_rgba(16,185,129,0.9)] border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-500/50 hover:shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)] ${
        showDetails ? "sm:col-span-2 lg:col-span-3" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-sm font-bold tracking-wider text-emerald-300 shadow-[0_0_10px_-2px_rgba(16,185,129,0.6)]">
            {evidence.id}
          </span>
          <h3 className="mt-1.5 truncate text-sm font-semibold text-slate-100" title={evidence.filename}>
            {evidence.filename}
          </h3>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${badge.style}`}>
          {badge.label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-500">Type</dt>
        <dd className="truncate text-slate-300">
          {evidence.type} <span className="text-slate-600">({evidence.mime_type})</span>
        </dd>
        <dt className="text-slate-500">Size</dt>
        <dd className="text-slate-300">{formatSize(evidence.size)}</dd>
        <dt className="text-slate-500">Uploaded</dt>
        <dd className="text-slate-300">{new Date(evidence.uploaded_at).toLocaleString()}</dd>
      </dl>

      <div className="mt-3 rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">SHA-256</span>
          <div className="flex gap-2">
            <button onClick={() => setExpanded((v) => !v)} className="text-slate-400 hover:text-emerald-400">
              {expanded ? "collapse" : "expand"}
            </button>
            <button onClick={copyHash} className="text-slate-400 hover:text-emerald-400">
              {copied ? "copied ✓" : "copy"}
            </button>
          </div>
        </div>
        <code className={`block text-slate-300 ${expanded ? "break-all" : "truncate"}`}>
          {expanded ? evidence.sha256 : `${evidence.sha256.slice(0, 16)}…${evidence.sha256.slice(-8)}`}
        </code>
      </div>

      <p
        className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-emerald-400"
        title="SHA-256 was computed from the stored original bytes. This is not a legal chain-of-custody certification."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
        SHA-256 VERIFIED
      </p>

      <div className="mt-3 border-t border-slate-800 pt-3">
        {extraction && (
          <>
            {extraction.status === "extracted" || extraction.status === "no_text" ? (
              <div className="mb-2 grid grid-cols-4 gap-1 text-center text-[10px] uppercase tracking-wider">
                {[
                  ["Claims", extraction.claims.length],
                  ["Entities", extraction.entities.length],
                  ["URLs", extraction.urls.length],
                  ["Timestamps", extraction.timestamps.length],
                ].map(([label, n]) => (
                  <div key={label} className="rounded border border-slate-800 bg-slate-950/60 py-1">
                    <div className="text-base font-bold text-emerald-400">{n}</div>
                    <div className="text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-2 text-xs text-slate-400">{extraction.notes[0] ?? "Text could not be extracted."}</p>
            )}
            {extraction.method === "ocr" && (
              <p className="mb-2 text-[10px] text-slate-500">
                Text derived by OCR from the original image; the image remains the source evidence.
              </p>
            )}
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={analyze}
            disabled={analyzing}
            className="flex-1 rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold tracking-widest text-emerald-300 transition hover:bg-emerald-500/20 hover:shadow-[0_0_16px_-4px_rgba(16,185,129,0.8)] disabled:cursor-wait disabled:opacity-60"
          >
            {analyzing ? "ANALYZING…" : extraction ? "[ RE-ANALYZE ]" : "[ ANALYZE EVIDENCE ]"}
          </button>
          {extraction && (
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="rounded border border-slate-700 px-3 py-1.5 text-xs tracking-widest text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
            >
              {showDetails ? "HIDE" : "DETAILS"}
            </button>
          )}
        </div>

        {analyzeError && (
          <p className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-300">
            ✕ {analyzeError}
          </p>
        )}
      </div>

      {extraction && showDetails && <ExtractionDetails result={extraction} />}
    </article>
  );
}
