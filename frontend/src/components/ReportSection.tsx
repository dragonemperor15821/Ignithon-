import { useCallback, useState } from "react";
import { generateReport, getReport, reportMarkdownUrl } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";
import {
  AlertCircleIcon,
  DownloadIcon,
  LockIcon,
  ReportIcon,
  ShieldCheckIcon,
  TimelineIcon,
} from "./Icons";

const SECTION_ICONS: Record<string, typeof ReportIcon> = {
  executive_summary: ReportIcon,
  evidence: ShieldCheckIcon,
  timeline: TimelineIcon,
  missing_information: AlertCircleIcon,
  contradictions: AlertCircleIcon,
  redaction: LockIcon,
  limitations: AlertCircleIcon,
};

export default function ReportSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [redacted, setRedacted] = useState(false);
  const load = useCallback(() => getReport(redacted), [redacted]);
  const run = useCallback(() => generateReport(redacted), [redacted]);
  const { data, error, busy, execute } = useAnalysis(load, run, [redacted, refreshKey]);
  const statements = data?.sections.reduce((n, s) => n + s.statements.length, 0) ?? 0;

  return (
    <AnalysisSection
      id="06"
      htmlId="section-report"
      title="Forensic Incident Report"
      count={data?.generated_at ? statements : null}
      unit="REPORT STATEMENTS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "REGENERATE REPORT" : "GENERATE REPORT"}
      onRun={execute}
      emptyText="No report generated yet. Generating a report synthesizes evidence claims, chronological events, identified gaps, and contradictions into a formal investigation document."
      subtitle={
        data?.generated_at && (
          <span className="font-mono text-slate-400">
            {redacted ? "REDACTED SANITIZED VERSION" : "FULL UNREDACTED INVESTIGATION DOSSIER"} · generated{" "}
            {new Date(data.generated_at).toLocaleString()} · fully sourced
          </span>
        )
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* Redacted Toggle */}
          <div className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/90 p-0.5 text-[11px] font-mono">
            <button
              onClick={() => setRedacted(false)}
              className={`rounded px-2.5 py-1 font-semibold transition ${
                !redacted
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Unredacted
            </button>
            <button
              onClick={() => setRedacted(true)}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-semibold transition ${
                redacted
                  ? "bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LockIcon className="h-3 w-3" />
              <span>Redacted</span>
            </button>
          </div>

          {/* Export Markdown */}
          {data?.generated_at && (
            <a
              href={reportMarkdownUrl(redacted)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400 transition"
              title="Download full incident report as Markdown"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              <span>EXPORT MARKDOWN</span>
            </a>
          )}
        </div>
      }
    >
      {/* Formal Investigation Document Container */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-5 sm:p-7 shadow-2xl relative">
        {/* Document Header / Classification Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5 mb-6">
          <div>
            <div className="flex items-center gap-2 text-slate-400 font-mono text-[10px] uppercase tracking-widest">
              <span>DOCUMENT REF: CF-INC-{(data?.generated_at ? new Date(data.generated_at).getTime() : 0).toString().slice(-8)}</span>
              <span>·</span>
              <span className="text-emerald-400 font-bold">DIGITAL FORENSIC DOSSIER</span>
            </div>
            <h3 className="mt-1 text-lg sm:text-xl font-bold tracking-tight text-white uppercase">
              Incident Investigation &amp; Evidence Reconstruction Synthesis
            </h3>
          </div>

          <div className="flex flex-col sm:items-end text-[11px] font-mono text-slate-400">
            <span className="rounded bg-slate-900 border border-slate-700/80 px-2 py-0.5 font-bold uppercase text-slate-300">
              {redacted ? "CLASSIFICATION: REDACTED (PUBLIC RELEASE)" : "CLASSIFICATION: PRIVILEGED FORENSIC RECORD"}
            </span>
            <span className="mt-1 text-slate-400">
              {data?.generated_at ? new Date(data.generated_at).toLocaleDateString() : ""}
            </span>
          </div>
        </div>

        {/* Report Sections */}
        <div className="space-y-7">
          {data?.sections.map((s, idx) => {
            const Icon = SECTION_ICONS[s.key] ?? ReportIcon;
            return (
              <div key={s.key} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <Icon className="h-4 w-4 text-cyan-400 shrink-0" />
                  <h4 className="text-xs sm:text-sm font-bold tracking-wider text-slate-100 uppercase">
                    {s.title}
                  </h4>
                  <span className="ml-auto font-mono text-[10px] text-slate-400">
                    {s.statements.length} {s.statements.length === 1 ? "statement" : "statements"}
                  </span>
                </div>

                {s.statements.length === 0 ? (
                  <p className="text-xs text-slate-400 italic pl-6 py-1">No recorded findings in this section.</p>
                ) : (
                  <ul className="space-y-2 pl-1 sm:pl-3">
                    {s.statements.map((st, i) => (
                      <li
                        key={i}
                        className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-3 sm:p-3.5 text-xs text-slate-200 transition hover:border-slate-700"
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed font-sans text-xs sm:text-sm">
                          {st.text}
                        </p>
                        {s.key !== "claims" &&
                          s.key !== "evidence" &&
                          (st.evidence_ids.length > 0 || st.claim_ids.length > 0) && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/60">
                              <SourceRefs
                                evidence={st.evidence_ids}
                                claims={st.claim_ids.slice(0, 12)}
                                events={st.event_ids.slice(0, 12)}
                              />
                            </div>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AnalysisSection>
  );
}

