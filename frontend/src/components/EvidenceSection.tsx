import { useCallback, useEffect, useState } from "react";
import { listEvidence, listExtractions, runAllExtractions, type Evidence, type ExtractionResult } from "../api";
import EvidenceList from "./EvidenceList";
import EvidenceUpload from "./EvidenceUpload";

interface Props {
  refreshKey?: number; // bumps after a case analysis
  onChanged?: () => void; // evidence uploaded or (re-)analyzed
}

export default function EvidenceSection({ refreshKey = 0, onChanged }: Props) {
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
  }, [refresh, refreshKey]);

  const onExtracted = useCallback(
    (result: ExtractionResult) => {
      setExtractions((prev) => ({ ...prev, [result.evidence_id]: result }));
      onChanged?.();
    },
    [onChanged],
  );

  const onUploaded = useCallback(async () => {
    await refresh();
    onChanged?.();
  }, [refresh, onChanged]);

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
            title="Extract text only, without the rest of the pipeline (manual)"
            className="rounded border border-slate-700 px-3 py-1.5 text-[10px] tracking-widest text-slate-400 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {runningAll ? "EXTRACTING…" : `EXTRACT ${pending} PENDING ONLY`}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          ✕ {error}
        </p>
      )}

      <EvidenceUpload onUploaded={onUploaded} />
      {evidence && <EvidenceList evidence={evidence} extractions={extractions} onExtracted={onExtracted} />}
    </section>
  );
}
