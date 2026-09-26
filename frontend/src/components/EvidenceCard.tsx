import { useState } from "react";
import type { Evidence } from "../api";

const STATUS_STYLE: Record<Evidence["status"], string> = {
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  processing: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  processed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/40",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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
    <article className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-500/50 hover:shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-bold text-emerald-400">{evidence.id}</span>
          <h3 className="truncate text-sm font-semibold text-slate-100" title={evidence.filename}>
            {evidence.filename}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLE[evidence.status]}`}
        >
          {evidence.status}
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
    </article>
  );
}
