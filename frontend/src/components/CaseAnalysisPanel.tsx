import { useEffect, useState } from "react";
import {
  analyzeCase,
  getCaseOverview,
  type CaseAnalysis,
  type CaseOverview,
  type CaseStageName,
  type StageResult,
  type StageStatus,
} from "../api";

const STAGES: { name: CaseStageName; label: string }[] = [
  { name: "extraction", label: "EXTRACTING EVIDENCE" },
  { name: "timeline", label: "BUILDING TIMELINE" },
  { name: "missing_info", label: "DETECTING EVIDENCE GAPS" },
  { name: "contradictions", label: "DETECTING CONTRADICTIONS" },
  { name: "redaction", label: "REDACTING PII" },
  { name: "report", label: "GENERATING INCIDENT REPORT" },
];

const MARK: Record<StageStatus, { icon: string; style: string }> = {
  pending: { icon: "○", style: "text-slate-600" },
  running: { icon: "▸", style: "text-sky-300 animate-pulse" },
  completed: { icon: "✓", style: "text-emerald-400" },
  failed: { icon: "✕", style: "text-rose-400" },
  skipped: { icon: "–", style: "text-slate-500" },
};

const RESULT_STYLE: Record<string, string> = {
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  completed_with_errors: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  failed: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  empty: "border-slate-700 bg-slate-800 text-slate-400",
};

function detail(name: CaseStageName, r: StageResult): string {
  switch (name) {
    case "extraction":
      return r.processed === null ? "" : `${r.processed} analyzed · ${r.reused} already done · ${r.failed} failed`;
    case "timeline":
      return r.events === null ? "" : `${r.events} events`;
    case "missing_info":
      return r.items === null ? "" : `${r.items} gaps`;
    case "contradictions":
      return r.items === null ? "" : `${r.items} contradictions`;
    case "redaction":
      return r.items === null ? "" : `${r.items} items · ${r.masked} identifiers masked`;
    case "report":
      return r.statements === null ? "" : `${r.statements} statements`;
  }
}

interface Props {
  evidenceVersion: number; // bumps when evidence is uploaded
  onAnalyzed: () => void; // refresh every dashboard section
}

export default function CaseAnalysisPanel({ evidenceVersion, onAnalyzed }: Props) {
  const [overview, setOverview] = useState<CaseOverview | null>(null);
  const [stages, setStages] = useState<Partial<Record<CaseStageName, StageResult>>>({});
  const [result, setResult] = useState<CaseAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCaseOverview()
      .then((o) => {
        setOverview(o);
        if (!running && o.last_run && o.last_run.status !== "empty") {
          setResult(o.last_run);
          setStages(o.last_run.stages);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load case"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceVersion]);

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStages({});
    try {
      const final = await analyzeCase((e) => {
        if (e.event === "stage") setStages((prev) => ({ ...prev, [e.stage]: e.result }));
      });
      setResult(final);
      setStages(final.stages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Case analysis failed");
    } finally {
      setRunning(false);
      getCaseOverview().then(setOverview).catch(() => undefined);
      onAnalyzed();
    }
  }

  const total = overview?.evidence_total ?? 0;
  const types = Object.entries(overview?.evidence_by_type ?? {});
  const showProgress = running || result !== null;

  return (
    <section className="mb-5 rounded-lg border border-emerald-500/50 bg-slate-900/80 p-5 shadow-[0_0_40px_-12px_rgba(16,185,129,0.6)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs text-emerald-500/70">[CASE]</span>
          <p className="text-2xl font-bold text-emerald-400">
            {overview === null ? "--" : String(total).padStart(2, "0")}{" "}
            <span className="text-sm tracking-widest text-slate-400">FILES UPLOADED</span>
          </p>
          {types.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-wider">
              {types.map(([t, n]) => (
                <span key={t} className="rounded border border-slate-700 px-1.5 text-slate-300">
                  {n} {t}
                </span>
              ))}
              {overview && overview.pending > 0 && (
                <span className="rounded border border-amber-500/40 px-1.5 text-amber-300">{overview.pending} pending</span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={run}
          disabled={running || total === 0}
          className="rounded-md border-2 border-emerald-400 bg-emerald-500/20 px-6 py-3 text-sm font-bold tracking-[0.25em] text-emerald-200 shadow-[0_0_24px_-6px_rgba(16,185,129,0.9)] transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "ANALYZING CASE…" : "ANALYZE ENTIRE CASE"}
        </button>
      </div>

      {total === 0 && overview !== null && (
        <p className="mt-3 text-xs text-slate-500">Upload evidence below, then analyze the entire case in one step.</p>
      )}

      {error && (
        <p className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">✕ {error}</p>
      )}

      {showProgress && (
        <ol className="mt-4 grid gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {STAGES.map(({ name, label }) => {
            const r = stages[name];
            const mark = MARK[r?.status ?? "pending"];
            return (
              <li key={name} className="flex items-start gap-2 rounded border border-slate-800 bg-slate-950/60 px-3 py-2">
                <span className={`w-3 font-bold ${mark.style}`}>{mark.icon}</span>
                <div className="min-w-0">
                  <div className={`font-bold tracking-widest ${r?.status === "completed" ? "text-slate-200" : "text-slate-400"}`}>{label}</div>
                  {r && <div className="truncate text-[10px] text-slate-500">{r.error ?? detail(name, r)}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {result && !running && (
        <div className="mt-3 text-xs">
          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${RESULT_STYLE[result.status] ?? ""}`}>
            {result.status.replace(/_/g, " ")}
          </span>
          <span className="ml-2 text-slate-400">
            {result.evidence_analyzed} of {result.evidence_total} items readable
            {result.finished_at && ` · finished ${new Date(result.finished_at).toLocaleString()}`}
          </span>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300/90">
              {result.errors.map((e, i) => (
                <li key={i}>
                  ⚠ {e.evidence_id ? (
                    <a href={`#evidence-${e.evidence_id}`} className="underline">{e.evidence_id}</a>
                  ) : (
                    <span className="uppercase">{e.stage} stage</span>
                  )}
                  : {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
