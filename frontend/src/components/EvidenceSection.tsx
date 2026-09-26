import { useCallback, useEffect, useState } from "react";
import { listEvidence, listExtractions, runAllExtractions, type Evidence, type ExtractionResult } from "../api";
import EvidenceList from "./EvidenceList";
import EvidenceUpload from "./EvidenceUpload";

export default function EvidenceSection() {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [extractions, setExtractions] = useState<Record<string, ExtractionResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [ev, ex] = await Promise.all([listEvidence(), listExtractions()]);
      setEvidence(ev);
      setExtractions(Object.fromEntries(ex.map((r) => [r.evidence_id, r])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load evidence");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onExtracted = useCallback((result: ExtractionResult) => {
    setExtractions((prev) => ({ ...prev, [result.evidence_id]: result }));
  }, []);

  async function analyzeAll() {
    setRunningAll(true);
    try {
      (await runAllExtractions()).forEach(onExtracted);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction run failed");
    } finally {
      setRunningAll(false);
    }
  }

  const count = evidence?.length ?? 0;
  const analyzed = evidence?.filter((e) => extractions[e.id]).length ?? 0;
  const pending = count - analyzed;

  return (
    <section className="mb-5 rounded-lg border border-emerald-500/30 bg-slate-900/60 p-5 shadow-[0_0_32px_-12px_rgba(16,185,129,0.4)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs text-emerald-500/70">[01]</span>
          <h2 className="text-lg font-semibold tracking-[0.2em] text-slate-100">EVIDENCE</h2>
          <p className="text-2xl font-bold text-emerald-400">
            {evidence === null ? "--" : String(count).padStart(2, "0")}{" "}
            <span className="text-sm tracking-widest text-slate-400">ITEMS</span>
          </p>
          {evidence !== null && count === 0 && <p className="mt-1 text-xs text-slate-500">Awaiting evidence...</p>}
          {count > 0 && (
            <p className="mt-1 text-xs tracking-wider text-slate-500">
              <span className="text-emerald-400">{String(analyzed).padStart(2, "0")}</span> ANALYZED ·{" "}
              <span className="text-amber-300">{String(pending).padStart(2, "0")}</span> PENDING
            </p>
          )}
        </div>
        {pending > 0 && (
          <button
            onClick={analyzeAll}
            disabled={runningAll}
            className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold tracking-widest text-emerald-300 transition hover:bg-emerald-500/20 hover:shadow-[0_0_16px_-4px_rgba(16,185,129,0.8)] disabled:cursor-wait disabled:opacity-60"
          >
            {runningAll ? "ANALYZING…" : `[ ANALYZE ${pending} PENDING ]`}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          ✕ {error}
        </p>
      )}

      <EvidenceUpload onUploaded={refresh} />
      {evidence && <EvidenceList evidence={evidence} extractions={extractions} onExtracted={onExtracted} />}
    </section>
  );
}
