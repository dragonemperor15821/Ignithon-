import { useCallback, useEffect, useState } from "react";
import { listEvidence, type Evidence } from "../api";
import EvidenceList from "./EvidenceList";
import EvidenceUpload from "./EvidenceUpload";

export default function EvidenceSection() {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEvidence(await listEvidence());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load evidence");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const count = evidence?.length ?? 0;

  return (
    <section className="mb-5 rounded-lg border border-emerald-500/30 bg-slate-900/60 p-5 shadow-[0_0_32px_-12px_rgba(16,185,129,0.4)]">
      <div className="mb-4">
        <span className="text-xs text-emerald-500/70">[01]</span>
        <h2 className="text-lg font-semibold tracking-[0.2em] text-slate-100">EVIDENCE</h2>
        <p className="text-2xl font-bold text-emerald-400">
          {evidence === null ? "--" : String(count).padStart(2, "0")}{" "}
          <span className="text-sm tracking-widest text-slate-400">ITEMS</span>
        </p>
        {evidence !== null && count === 0 && <p className="mt-1 text-xs text-slate-500">Awaiting evidence...</p>}
      </div>

      {error && (
        <p className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          ✕ {error}
        </p>
      )}

      <EvidenceUpload onUploaded={refresh} />
      {evidence && <EvidenceList evidence={evidence} />}
    </section>
  );
}
