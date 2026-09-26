import { useEffect, useState } from "react";
import { getAuditLog, type AuditEvent } from "../api";

const LABEL: Record<string, string> = {
  evidence_uploaded: "Evidence uploaded",
  sha256_calculated: "SHA-256 calculated",
  extraction_completed: "Extraction completed",
  ocr_completed: "OCR completed",
  case_analysis_completed: "Case analysis completed",
  report_generated: "Report generated",
};

const OK = new Set(["ok", "extracted", "completed", "no_text"]);

export default function AuditLogSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuditLog()
      .then((e) => {
        setEvents(e);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit log"));
  }, [refreshKey]);

  const shown = [...(events ?? [])].reverse(); // newest first

  return (
    <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <span className="text-xs text-emerald-500/70">[07]</span>
          <h2 className="text-lg font-semibold tracking-[0.2em] text-slate-100">CHAIN OF CUSTODY</h2>
          <p className="text-xs tracking-wider text-slate-500">
            {events === null ? "--" : events.length} recorded actions · append-only, newest first
          </p>
        </div>
      </div>
      {error && <p className="mb-2 text-xs text-rose-300">✕ {error}</p>}
      {events !== null && events.length === 0 ? (
        <p className="rounded border border-dashed border-slate-700 p-3 text-center text-xs text-slate-500">
          No actions recorded yet.
        </p>
      ) : (
        <ol className="max-h-72 space-y-1 overflow-auto border-l border-emerald-500/30 pl-3 text-xs">
          {shown.map((e) => (
            <li key={e.seq} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[10px] text-slate-500">{new Date(e.timestamp).toLocaleString()}</span>
              <span className={OK.has(e.status) ? "text-emerald-400" : "text-amber-300"}>{OK.has(e.status) ? "✓" : "⚠"}</span>
              <span className="text-slate-200">{LABEL[e.action] ?? e.action}</span>
              {e.evidence_id && (
                <a href={`#evidence-${e.evidence_id}`} className="font-mono text-emerald-300 hover:underline">
                  {e.evidence_id}
                </a>
              )}
              <span className="text-[10px] uppercase text-slate-500">{e.status}</span>
              {e.detail && (
                <span className="truncate font-mono text-[10px] text-slate-500" title={e.detail}>
                  {e.detail.length > 24 && e.action === "sha256_calculated" ? `${e.detail.slice(0, 16)}…` : e.detail}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
