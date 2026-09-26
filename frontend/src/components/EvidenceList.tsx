import type { Evidence } from "../api";
import EvidenceCard from "./EvidenceCard";

export default function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {evidence.map((e) => (
        <EvidenceCard key={e.id} evidence={e} />
      ))}
    </div>
  );
}
