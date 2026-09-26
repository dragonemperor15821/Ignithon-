import { useEffect, useState } from "react";
import CaseAnalysisPanel from "./components/CaseAnalysisPanel";
import CyberBackground from "./components/CyberBackground";
import EvidenceSection from "./components/EvidenceSection";
import TimelineSection from "./components/TimelineSection";
import MissingInfoSection from "./components/MissingInfoSection";
import ContradictionsSection from "./components/ContradictionsSection";
import RedactionSection from "./components/RedactionSection";
import ReportSection from "./components/ReportSection";
import AuditLogSection from "./components/AuditLogSection";
import { ShieldCheckIcon } from "./components/Icons";

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

  const dot = {
    checking: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]",
    online: "bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]",
    offline: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]",
  }[health];

  return (
    <div className="relative min-h-screen text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Subtle Animated Cybersecurity Background */}
      <CyberBackground />

      {/* Main Content Container on top of background */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Sticky Cyber Forensic Navigation Header */}
        <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
            {/* Logo & Subtitle */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border border-emerald-500/40 shadow-[0_0_15px_-3px_rgba(16,185,129,0.5)]">
                <ShieldCheckIcon className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold tracking-[0.25em] text-white font-mono">
                    CASE<span className="text-emerald-400">FORGE</span>
                  </h1>
                  <span className="hidden sm:inline-block rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-emerald-400">
                    FORENSIC OS
                  </span>
                </div>
                <p className="hidden md:block text-[10px] uppercase tracking-widest text-slate-400">
                  Digital Evidence Intelligence &amp; Incident Reconstruction
                </p>
              </div>
            </div>

            {/* Quick Section Navigation (Desktop) */}
            <nav className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-slate-400">
              <a href="#section-evidence" className="px-2.5 py-1 rounded hover:text-emerald-300 hover:bg-slate-900 transition">
                [01] Evidence
              </a>
              <span className="text-slate-700">·</span>
              <a href="#section-timeline" className="px-2.5 py-1 rounded hover:text-emerald-300 hover:bg-slate-900 transition">
                [02] Timeline
              </a>
              <span className="text-slate-700">·</span>
              <a href="#section-gaps" className="px-2.5 py-1 rounded hover:text-amber-300 hover:bg-slate-900 transition">
                [03] Gaps
              </a>
              <span className="text-slate-700">·</span>
              <a href="#section-contradictions" className="px-2.5 py-1 rounded hover:text-rose-300 hover:bg-slate-900 transition">
                [04] Conflicts
              </a>
              <span className="text-slate-700">·</span>
              <a href="#section-redaction" className="px-2.5 py-1 rounded hover:text-cyan-300 hover:bg-slate-900 transition">
                [05] Redaction
              </a>
              <span className="text-slate-700">·</span>
              <a href="#section-report" className="px-2.5 py-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 font-bold transition">
                [06] Report
              </a>
            </nav>

            {/* API Health Pill */}
            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1 font-mono text-xs text-slate-300 shadow-sm">
              <span className={`h-2 w-2 rounded-full ${dot} ${health === "online" ? "animate-pulse" : ""}`} />
              <span className="text-[11px] font-semibold tracking-wider">
                NODE {health.toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6 md:py-8">
          {/* Pipeline Ribbon Banner */}
          <div className="mb-6 flex items-center justify-between overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 text-[11px] font-mono text-slate-400 scrollbar-none">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-emerald-400 font-bold">PIPELINE:</span>
              <span className="text-slate-300">Ingest Evidence</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-300">OCR &amp; Extraction</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-300">Timeline Reconstruction</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-300">Gap Analysis</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-300">Contradiction Detection</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-300">PII Sanitization</span>
              <span className="text-slate-600">→</span>
              <span className="text-emerald-400 font-semibold">Incident Dossier</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 pl-4 text-[10px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>CRYPTOGRAPHICALLY VERIFIED</span>
            </div>
          </div>

          {/* Forensic Pipeline Sections */}
          <CaseAnalysisPanel
            evidenceVersion={evidenceVersion}
            onAnalyzed={() => setCaseVersion((v) => v + 1)}
          />

          <EvidenceSection
            refreshKey={caseVersion}
            onChanged={() => setEvidenceVersion((v) => v + 1)}
          />

          <TimelineSection refreshKey={caseVersion} />

          <MissingInfoSection refreshKey={caseVersion} />

          <ContradictionsSection refreshKey={caseVersion} />

          <RedactionSection refreshKey={caseVersion} />

          <ReportSection refreshKey={caseVersion} />

          <AuditLogSection refreshKey={caseVersion + evidenceVersion} />
        </main>

        {/* Professional Cyber Forensics Footer */}
        <footer className="mt-auto border-t border-slate-800/80 bg-slate-950/90 py-6 text-xs text-slate-400">
          <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-2 font-mono">
              <span className="font-bold text-white">CASEFORGE</span>
              <span>· Digital Evidence Forensics Engine</span>
            </div>
            <p className="text-[11px] text-slate-400 text-center sm:text-right">
              SHA-256 verification guaranteed. Original evidence bytes immutable.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

