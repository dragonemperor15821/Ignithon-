import { useEffect, useState } from "react";
import EvidenceSection from "./components/EvidenceSection";

type Health = "checking" | "online" | "offline";

const STAGES = [
  { id: "02", title: "Timeline", desc: "Chronological events, each linked to its source evidence." },
  { id: "03", title: "Missing Information", desc: "Gaps flagged for investigation — never invented." },
  { id: "04", title: "Contradictions", desc: "Conflicting claims surfaced side by side, not auto-resolved." },
  { id: "05", title: "Redaction", desc: "PII masked on derived copies only." },
  { id: "06", title: "Incident Report", desc: "Evidence-backed report generated from the reconstruction." },
];

export default function App() {
  const [health, setHealth] = useState<Health>("checking");

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

        <EvidenceSection />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STAGES.map((s) => (
            <section
              key={s.id}
              className="group rounded-lg border border-slate-800 bg-slate-900/60 p-5 transition hover:border-emerald-500/50 hover:shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-emerald-500/70">[{s.id}]</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                  pending
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-100">{s.title}</h2>
              <p className="mt-2 text-sm text-slate-400">{s.desc}</p>
              <div className="mt-4 flex h-24 items-center justify-center rounded border border-dashed border-slate-700 text-xs text-slate-600">
                no data
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
