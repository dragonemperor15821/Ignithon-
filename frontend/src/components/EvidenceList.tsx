import type { Evidence, ExtractionResult } from "../api";
import EvidenceCard from "./EvidenceCard";

interface Props {
  evidence: Evidence[];
  extractions: Record<string, ExtractionResult>;
  onExtracted: (result: ExtractionResult) => void;
}

export default function EvidenceList({ evidence, extractions, onExtracted }: Props) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {evidence.map((e) => (
        <EvidenceCard key={e.id} evidence={e} extraction={extractions[e.id]} onExtracted={onExtracted} />
      ))}
    </div>
  );
}
