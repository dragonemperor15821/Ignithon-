import { useMemo, useState } from "react";
import { getMissingInfo, runMissingInfo, type MissingInfoItem, type Severity } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";
import { ChevronRightIcon } from "./Icons";

const SEVERITY_BADGE: Record<Severity, { label: string; badge: string; accent: string }> = {
  high: {
    label: "High Priority",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    accent: "border-l-rose-500 bg-rose-950/10",
  },
  medium: {
    label: "Medium",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    accent: "border-l-amber-500 bg-amber-950/10",
  },
  low: {
    label: "Low",
    badge: "bg-slate-800 text-slate-400 border-slate-700",
    accent: "border-l-slate-600 bg-slate-950/50",
  },
};

function GapCard({ item }: { item: MissingInfoItem }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_BADGE[item.severity];

  return (
    <li
      className={`rounded-lg border border-slate-800/90 p-3.5 text-xs transition-all duration-150 hover:border-slate-700 border-l-4 ${sev.accent}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[10px]">
            {item.id}
          </span>
          <span className={`rounded-full border px-2 py-0.2 text-[10px] font-semibold uppercase tracking-wider ${sev.badge}`}>
            {sev.label}
          </span>
          <span className="rounded bg-slate-800/80 border border-slate-700/80 px-2 py-0.2 text-[10px] uppercase tracking-wider text-slate-300 font-sans">
            {item.category.replace(/_/g, " ")}
          </span>
        </div>

        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
          {item.status}
        </span>
      </div>

      <p className="mt-2 text-slate-200 font-sans leading-relaxed text-xs sm:text-sm font-medium">
        {item.description}
      </p>

      {item.supporting_text && (
        <div className="mt-2">
          {expanded ? (
            <div className="rounded border border-slate-800 bg-slate-900/80 p-2.5 text-[11px] font-mono text-slate-300">
              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase mb-1">
                <span>Supporting Evidence Excerpt</span>
                <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-white">
                  collapse
                </button>
              </div>
              <p className="whitespace-pre-wrap break-words italic text-slate-300">“{item.supporting_text}”</p>
            </div>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-400 transition"
            >
              <ChevronRightIcon className="h-3 w-3" />
              <span>Inspect supporting text snippet…</span>
            </button>
          )}
        </div>
      )}

      <SourceRefs
        evidence={item.source_evidence_ids}
        claims={item.source_claim_ids}
        events={item.timeline_event_ids}
      />
    </li>
  );
}

export default function MissingInfoSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, busy, execute } = useAnalysis(getMissingInfo, runMissingInfo, [refreshKey]);
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");

  const items = data?.items ?? [];
  const highCount = items.filter((i) => i.severity === "high").length;
  const mediumCount = items.filter((i) => i.severity === "medium").length;
  const lowCount = items.filter((i) => i.severity === "low").length;

  const filteredItems = useMemo(() => {
    if (severityFilter === "all") return items;
    return items.filter((i) => i.severity === severityFilter);
  }, [items, severityFilter]);

  return (
    <AnalysisSection
      id="03"
      htmlId="section-gaps"
      title="Missing Information & Evidence Gaps"
      count={data ? items.length : null}
      unit="GAPS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "RE-ANALYZE GAPS" : "FIND EVIDENCE GAPS"}
      onRun={execute}
      emptyText={
        data?.status === "empty"
          ? "No evidence gaps or incomplete links detected by the heuristic rules. All required identifiers, dates, and actors are corroborated."
          : "Not analyzed yet. Upload evidence and run case analysis to scan for uncorroborated gaps."
      }
      notes={data?.notes}
      subtitle={
        data?.generated_at && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-rose-300">{highCount} HIGH</span> ·{" "}
            <span className="font-semibold text-amber-300">{mediumCount} MEDIUM</span> ·{" "}
            <span className="text-slate-400">{lowCount} LOW</span> · analyzed{" "}
            {new Date(data.generated_at).toLocaleTimeString()}
          </span>
        )
      }
    >
      {items.length > 0 && (
        <div className="space-y-4">
          {/* Severity filter pills */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase mr-1">Filter Severity:</span>
            <button
              onClick={() => setSeverityFilter("all")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                severityFilter === "all"
                  ? "bg-slate-800 text-white border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setSeverityFilter("high")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                severityFilter === "high"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "text-rose-400/80 hover:text-rose-300"
              }`}
            >
              High ({highCount})
            </button>
            <button
              onClick={() => setSeverityFilter("medium")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                severityFilter === "medium"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-amber-400/80 hover:text-amber-300"
              }`}
            >
              Medium ({mediumCount})
            </button>
            <button
              onClick={() => setSeverityFilter("low")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                severityFilter === "low"
                  ? "bg-slate-700/60 text-slate-200 border border-slate-600"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Low ({lowCount})
            </button>
          </div>

          <ul className="space-y-2.5">
            {filteredItems.map((i) => (
              <GapCard key={i.id} item={i} />
            ))}
          </ul>
        </div>
      )}
    </AnalysisSection>
  );
}

