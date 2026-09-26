import { useEffect, useState } from "react";
import CaseAnalysisPanel from "./components/CaseAnalysisPanel";
import EvidenceSection from "./components/EvidenceSection";
import TimelineSection from "./components/TimelineSection";
import MissingInfoSection from "./components/MissingInfoSection";
import ContradictionsSection from "./components/ContradictionsSection";
import RedactionSection from "./components/RedactionSection";
import ReportSection from "./components/ReportSection";

type Health = "checking" | "online" | "offline";

export default function App() {
  const [health, setHealth] = useState<Health>("checking");
  const [evidenceVersion, setEvidenceVersion] = useState(0); // evidence uploaded/changed
  const [caseVersion, setCaseVersion] = useState(0); // a case analysis finished: reload every section

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.status === "ok" ? "online" : "offline"))
      .catch(() => setHealth("offline"));
  }, []);

  const dot = { checking: "bg-amber-400", online: "bg-emerald-400", offline: "bg-rose-500" }[health];

  return (
    <div className="min-h-screen text-slate-200">
      <header className="border-b border-emerald-500/20 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-[0.3em] text-emerald-400">CASEFORGE</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">
              Digital Evidence Intelligence &amp; Incident Reconstruction
            </p>
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-800 px-3 py-1.5 text-xs text-slate-400">
            <span className={`h-2 w-2 rounded-full ${dot} ${health === "online" ? "animate-pulse" : ""}`} />
            API {health.toUpperCase()}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <p className="mb-6 text-xs text-slate-500">
          <span className="text-emerald-500">$</span> pipeline: evidence → extraction → timeline → gaps → contradictions → redaction → report
        </p>

        <CaseAnalysisPanel evidenceVersion={evidenceVersion} onAnalyzed={() => setCaseVersion((v) => v + 1)} />
        <EvidenceSection refreshKey={caseVersion} onChanged={() => setEvidenceVersion((v) => v + 1)} />
        <TimelineSection refreshKey={caseVersion} />

        <MissingInfoSection refreshKey={caseVersion} />
        <ContradictionsSection refreshKey={caseVersion} />
        <RedactionSection refreshKey={caseVersion} />
        <ReportSection refreshKey={caseVersion} />
      </main>
    </div>
  );
}
