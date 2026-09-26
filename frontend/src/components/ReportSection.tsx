import { useCallback, useState } from "react";
import { generateReport, getReport, reportMarkdownUrl } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";

export default function ReportSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [redacted, setRedacted] = useState(false);
  const load = useCallback(() => getReport(redacted), [redacted]);
  const run = useCallback(() => generateReport(redacted), [redacted]);
  const { data, error, busy, execute } = useAnalysis(load, run, [redacted, refreshKey]);
  const statements = data?.sections.reduce((n, s) => n + s.statements.length, 0) ?? 0;

  return (
    <AnalysisSection
      id="06"
      title="Incident Report"
      count={data?.generated_at ? statements : null}
      unit="STATEMENTS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "REGENERATE REPORT" : "GENERATE REPORT"}
      onRun={execute}
      emptyText="No report yet. Generating refreshes the timeline, gaps, contradictions and redaction first."
      subtitle={
        data?.generated_at && (
          <>
            {redacted ? "REDACTED" : "UNREDACTED"} · generated {new Date(data.generated_at).toLocaleString()} · every statement lists its sources
          </>
        )
      }
      actions={
        <>
          <label className="flex items-center gap-1 text-[10px] tracking-widest text-slate-400">
            <input type="checkbox" checked={redacted} onChange={(e) => setRedacted(e.target.checked)} /> REDACTED
          </label>
          {data?.generated_at && (
            <a
              href={reportMarkdownUrl(redacted)}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-slate-700 px-3 py-1.5 text-xs tracking-widest text-slate-300 hover:border-emerald-500/50"
            >
              MARKDOWN
            </a>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {data?.sections.map((s) => (
          <div key={s.key}>
            <h3 className="mb-2 text-sm font-bold tracking-[0.2em] text-slate-100">{s.title.toUpperCase()}</h3>
            {s.statements.length === 0 ? (
              <p className="text-xs text-slate-600">None.</p>
            ) : (
              <ul className="space-y-1.5">
                {s.statements.map((st, i) => (
                  <li key={i} className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                    <p className="whitespace-pre-wrap break-words">{st.text}</p>
                    {s.key !== "claims" && s.key !== "evidence" && (st.evidence_ids.length > 0 || st.claim_ids.length > 0) && (
                      <SourceRefs evidence={st.evidence_ids} claims={st.claim_ids.slice(0, 12)} events={st.event_ids.slice(0, 12)} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </AnalysisSection>
  );
}
