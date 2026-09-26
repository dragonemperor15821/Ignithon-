import { useState } from "react";
import { getContradictions, runContradictions, type ClaimRef, type Contradiction } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";
import { ChevronDownIcon, ChevronRightIcon, SplitIcon } from "./Icons";

function Side({ label, claim, all }: { label: string; claim: ClaimRef; all: ClaimRef[] }) {
  const [showAll, setShowAll] = useState(false);
  const side = all.length ? all : [claim];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3.5 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="font-bold tracking-widest text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
            ASSERTION {label}
          </span>
          {side.length > 1 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
            >
              <span>{side.length} corroborated claims</span>
              {showAll ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
            </button>
          )}
        </div>

        <p className="mt-2.5 whitespace-pre-wrap break-words text-slate-100 font-sans text-xs sm:text-sm leading-relaxed">
          “{claim.text}”
        </p>

        {showAll && side.length > 1 && (
          <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-2 text-[11px]">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Additional Supporting Claims:</span>
            {side.slice(1).map((c, idx) => (
              <div key={idx} className="rounded bg-slate-950/60 p-2 font-mono text-slate-300">
                “{c.text}”
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/60">
        <SourceRefs
          evidence={[...new Set(side.map((c) => c.evidence_id))]}
          claims={side.map((c) => c.claim_id)}
        />
      </div>
    </div>
  );
}

function ContradictionCard({ item }: { item: Contradiction }) {
  return (
    <li className="rounded-xl border border-rose-500/30 bg-slate-950/70 p-4 text-xs transition-all duration-200 hover:border-rose-500/50 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px]">
            {item.id}
          </span>
          <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
            {item.type.replace(/_/g, " ")}
          </span>
        </div>

        <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300/90 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
          {item.status}
        </span>
      </div>

      {/* Explanation Banner */}
      <div className="my-3 flex items-start gap-2 rounded-lg bg-rose-950/20 border border-rose-500/20 p-3 text-slate-200">
        <SplitIcon className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
        <p className="font-sans text-xs leading-relaxed">{item.explanation}</p>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="grid gap-3 md:grid-cols-2">
        <Side label="A" claim={item.claim_a} all={item.claims_a} />
        <Side label="B" claim={item.claim_b} all={item.claims_b} />
      </div>
    </li>
  );
}

export default function ContradictionsSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, busy, execute } = useAnalysis(getContradictions, runContradictions, [refreshKey]);
  const items = data?.contradictions ?? [];

  return (
    <AnalysisSection
      id="04"
      htmlId="section-contradictions"
      title="Contradiction & Conflict Detection"
      count={data ? items.length : null}
      unit="CONFLICTS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "RE-CHECK CONTRADICTIONS" : "FIND CONTRADICTIONS"}
      onRun={execute}
      emptyText={
        data?.status === "empty"
          ? "No contradictions or conflicting assertions detected. Extracted claims across all evidence items are internally consistent."
          : "Not analyzed yet. Upload evidence and run case analysis to perform cross-evidence conflict detection."
      }
      notes={data?.notes}
      subtitle={
        data?.generated_at && (
          <span className="font-mono text-slate-400">
            {data.claim_count} claims cross-compared · conflicting statements shown side-by-side without automated bias
          </span>
        )
      }
    >
      <ul className="space-y-4">
        {items.map((c) => (
          <ContradictionCard key={c.id} item={c} />
        ))}
      </ul>
    </AnalysisSection>
  );
}

