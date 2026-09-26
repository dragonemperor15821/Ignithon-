import { getMissingInfo, runMissingInfo, type Severity } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-slate-600 bg-slate-800 text-slate-400",
};

export default function MissingInfoSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, busy, execute } = useAnalysis(getMissingInfo, runMissingInfo, [refreshKey]);
  const items = data?.items ?? [];
  const high = items.filter((i) => i.severity === "high").length;

  return (
    <AnalysisSection
      id="03"
      title="Missing Information"
      count={data ? items.length : null}
      unit="GAPS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "RE-RUN ANALYSIS" : "FIND GAPS"}
      onRun={execute}
      emptyText={data?.status === "empty" ? "No gaps detected by the current rules." : "Not analyzed yet — analyze evidence, then find gaps."}
      notes={data?.notes}
      subtitle={data?.generated_at && <>{high} HIGH · gaps are flagged, never filled in · run {new Date(data.generated_at).toLocaleString()}</>}
    >
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id} className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-bold tracking-wider text-emerald-400">{i.id}</span>
              <span className={`rounded border px-1.5 text-[10px] uppercase tracking-wider ${SEVERITY_STYLE[i.severity]}`}>{i.severity}</span>
              <span className="uppercase tracking-wider text-slate-400">{i.category.replace(/_/g, " ")}</span>
              <span className="text-[10px] uppercase text-slate-600">{i.status}</span>
            </div>
            <p className="text-slate-200">{i.description}</p>
            {i.supporting_text && <p className="mt-1 whitespace-pre-wrap break-words text-slate-400">“{i.supporting_text}”</p>}
            <SourceRefs evidence={i.source_evidence_ids} claims={i.source_claim_ids} events={i.timeline_event_ids} />
          </li>
        ))}
      </ul>
    </AnalysisSection>
  );
}
