import type { Evidence, ExtractionResult } from "../api";
import EvidenceCard from "./EvidenceCard";
import { SearchIcon } from "./Icons";

interface Props {
  evidence: Evidence[];
  extractions: Record<string, ExtractionResult>;
  onExtracted: (result: ExtractionResult) => void;
  onDeleted?: (evidenceId: string) => void;
  totalCount?: number;
  hasFilter?: boolean;
  onClearFilters?: () => void;
}

export default function EvidenceList({
  evidence,
  extractions,
  onExtracted,
  onDeleted,
  totalCount = 0,
  hasFilter = false,
  onClearFilters,
}: Props) {
  if (evidence.length === 0) {
    if (totalCount > 0 && hasFilter) {
      return (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400 mb-3">
            <SearchIcon className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-300">No matching evidence artifacts</p>
          <p className="mt-1 text-xs text-slate-400">
            No evidence files match your current search query or active filter settings.
          </p>
          {onClearFilters && (
            <button
              onClick={onClearFilters}
              className="mt-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-500/50 hover:bg-slate-700 transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {evidence.map((e) => (
        <EvidenceCard
          key={e.id}
          evidence={e}
          extraction={extractions[e.id]}
          onExtracted={onExtracted}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}

