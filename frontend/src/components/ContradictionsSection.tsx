import { getContradictions, runContradictions, type ClaimRef } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";

function Side({ label, claim, all }: { label: string; claim: ClaimRef; all: ClaimRef[] }) {
  const side = all.length ? all : [claim];
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
      <div className="text-[10px] font-bold tracking-widest text-slate-500">
        SIDE {label}
        {side.length > 1 && <span className="ml-2 text-slate-400">{side.length} CLAIMS</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-slate-200">“{claim.text}”</p>
      <SourceRefs
        evidence={[...new Set(side.map((c) => c.evidence_id))]}
        claims={side.map((c) => c.claim_id)}
      />
    </div>
  );
}

export default function ContradictionsSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, busy, execute } = useAnalysis(getContradictions, runContradictions, [refreshKey]);
  const items = data?.contradictions ?? [];

  return (
    <AnalysisSection
      id="04"
      title="Contradictions"
      count={data ? items.length : null}
      unit="CONFLICTS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "RE-CHECK" : "FIND CONTRADICTIONS"}
      onRun={execute}
      emptyText={data?.status === "empty" ? "No contradictions detected by the current rules." : "Not checked yet — analyze evidence, then look for contradictions."}
      notes={data?.notes}
      subtitle={data?.generated_at && <>{data.claim_count} CLAIMS COMPARED · shown side by side, never auto-resolved</>}
    >
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id} className="rounded border border-rose-500/30 bg-slate-950/60 p-3 text-xs">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-bold tracking-wider text-emerald-400">{c.id}</span>
              <span className="uppercase tracking-wider text-rose-300">{c.type.replace(/_/g, " ")}</span>
              <span className="text-[10px] uppercase text-slate-600">{c.status}</span>
            </div>
            <p className="mb-2 text-slate-300">{c.explanation}</p>
            <div className="grid gap-2 md:grid-cols-2">
              <Side label="A" claim={c.claim_a} all={c.claims_a} />
              <Side label="B" claim={c.claim_b} all={c.claims_b} />
            </div>
          </li>
        ))}
      </ul>
    </AnalysisSection>
  );
}
