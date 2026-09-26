import { useState } from "react";
import { getRedactions, runRedactions } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";

export default function RedactionSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, busy, execute } = useAnalysis(getRedactions, runRedactions, [refreshKey]);
  const [open, setOpen] = useState<string | null>(null);
  const items = data?.items ?? [];
  const masked = items.reduce((n, i) => n + i.spans.length, 0);

  return (
    <AnalysisSection
      id="05"
      title="Redaction"
      count={data ? masked : null}
      unit="MASKED"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "RE-REDACT" : "REDACT"}
      onRun={execute}
      emptyText="No redacted copies yet — analyze evidence, then redact."
      notes={data?.notes}
      subtitle={data?.generated_at && <>{items.length} ITEMS · derived copies only; originals and SHA-256 untouched</>}
    >
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.evidence_id} className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SourceRefs evidence={[i.evidence_id]} />
                <span className="uppercase tracking-wider text-slate-400">{i.status}</span>
                <span className="text-slate-500">
                  {Object.entries(i.counts).map(([t, n]) => `${n} ${t}`).join(" · ") || i.notes[0] || ""}
                </span>
              </div>
              {i.redacted_text && (
                <button
                  onClick={() => setOpen(open === i.evidence_id ? null : i.evidence_id)}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[10px] tracking-widest text-slate-300 hover:border-emerald-500/50"
                >
                  {open === i.evidence_id ? "HIDE" : "VIEW REDACTED TEXT"}
                </button>
              )}
            </div>
            <p className="mt-1 truncate text-[10px] text-slate-600" title={i.source_sha256}>
              derived from original SHA-256 {i.source_sha256}
            </p>
            {open === i.evidence_id && (
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-900 p-2 text-slate-200">
                {i.redacted_text}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </AnalysisSection>
  );
}
