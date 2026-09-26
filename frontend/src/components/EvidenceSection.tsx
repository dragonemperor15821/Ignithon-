import { useCallback, useEffect, useMemo, useState } from "react";
import { listEvidence, listExtractions, runAllExtractions, type Evidence, type ExtractionResult } from "../api";
import EvidenceList from "./EvidenceList";
import EvidenceUpload from "./EvidenceUpload";
import { ActivityIcon, CrossIcon, SearchIcon } from "./Icons";

interface Props {
  refreshKey?: number; // bumps after a case analysis
  onChanged?: () => void; // evidence uploaded or (re-)analyzed
}

export default function EvidenceSection({ refreshKey = 0, onChanged }: Props) {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [extractions, setExtractions] = useState<Record<string, ExtractionResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "analyzed" | "pending">("all");

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

  const onDeleted = useCallback(
    (evidenceId: string) => {
      setEvidence((prev) => prev?.filter((e) => e.id !== evidenceId) ?? prev);
      setExtractions(({ [evidenceId]: _removed, ...rest }) => rest);
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

  // Filter evidence list
  const filteredEvidence = useMemo(() => {
    if (!evidence) return [];
    return evidence.filter((e) => {
      // Search
      const q = search.trim().toLowerCase();
      if (q && !e.filename.toLowerCase().includes(q) && !e.id.toLowerCase().includes(q) && !e.sha256.toLowerCase().includes(q)) {
        return false;
      }
      // Type
      if (typeFilter !== "all" && e.type !== typeFilter) {
        return false;
      }
      // Status
      if (statusFilter === "analyzed" && !extractions[e.id]) {
        return false;
      }
      if (statusFilter === "pending" && extractions[e.id]) {
        return false;
      }
      return true;
    });
  }, [evidence, extractions, search, typeFilter, statusFilter]);

  const availableTypes = useMemo(() => {
    if (!evidence) return [];
    return Array.from(new Set(evidence.map((e) => e.type)));
  }, [evidence]);

  return (
    <section
      id="section-evidence"
      className="mb-8 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 md:p-6 backdrop-blur-md shadow-xl transition-all duration-200 hover:border-slate-700/80"
    >
      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
              [01]
            </span>
            <h2 className="text-base md:text-lg font-bold tracking-tight text-white uppercase">EVIDENCE INVENTORY</h2>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {evidence === null ? "--" : String(count).padStart(2, "0")}
            </span>
            <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
              REGISTERED ARTIFACTS
            </span>
          </div>
          {count > 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-mono font-semibold">{analyzed}</span> verified &amp; extracted ·{" "}
              <span className={pending > 0 ? "text-amber-400 font-mono font-semibold" : "text-slate-400 font-mono"}>
                {pending}
              </span>{" "}
              awaiting extraction
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No evidence loaded. Upload items below.</p>
          )}
        </div>

        {pending > 0 && (
          <button
            onClick={analyzeAll}
            disabled={runningAll}
            title="Batch-extract OCR and entities for all pending items only"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold tracking-wider text-slate-300 transition hover:border-emerald-500/50 hover:bg-slate-800 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {runningAll ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                <span>EXTRACTING {pending} PENDING…</span>
              </>
            ) : (
              <>
                <ActivityIcon className="h-3.5 w-3.5 text-emerald-400" />
                <span>EXTRACT {pending} PENDING ONLY</span>
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
          <CrossIcon className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Zone */}
      <EvidenceUpload onUploaded={onUploaded} />

      {/* Search and Filters Bar */}
      {count > 0 && (
        <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename, ID, or SHA-256…"
              className="w-full rounded-md border border-slate-800 bg-slate-900/90 pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:border-emerald-500/60 focus:outline-none font-mono"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status filters */}
            <div className="flex items-center rounded-md border border-slate-800 bg-slate-900/90 p-0.5 text-[11px]">
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded px-2 py-1 font-medium transition ${
                  statusFilter === "all" ? "bg-slate-800 text-white font-semibold" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All ({count})
              </button>
              <button
                onClick={() => setStatusFilter("analyzed")}
                className={`rounded px-2 py-1 font-medium transition ${
                  statusFilter === "analyzed"
                    ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Analyzed ({analyzed})
              </button>
              <button
                onClick={() => setStatusFilter("pending")}
                className={`rounded px-2 py-1 font-medium transition ${
                  statusFilter === "pending"
                    ? "bg-amber-500/20 text-amber-300 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Pending ({pending})
              </button>
            </div>

            {/* Type filters */}
            {availableTypes.length > 1 && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-[11px] text-slate-300 font-mono focus:border-emerald-500/60 focus:outline-none"
              >
                <option value="all">All File Types</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Evidence Cards Grid */}
      {evidence && (
        <EvidenceList
          evidence={filteredEvidence}
          extractions={extractions}
          onExtracted={onExtracted}
          onDeleted={onDeleted}
          totalCount={count}
          hasFilter={search.length > 0 || typeFilter !== "all" || statusFilter !== "all"}
          onClearFilters={() => {
            setSearch("");
            setTypeFilter("all");
            setStatusFilter("all");
          }}
        />
      )}
    </section>
  );
}

