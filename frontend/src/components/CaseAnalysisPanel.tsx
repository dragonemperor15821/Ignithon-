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
import {
  ActivityIcon,
  AlertCircleIcon,
  CheckIcon,
  CrossIcon,
  FileIcon,
  LockIcon,
  ReportIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TimelineIcon,
} from "./Icons";

const STAGES: { name: CaseStageName; label: string; desc: string }[] = [
  { name: "extraction", label: "Evidence Extraction", desc: "OCR & entity harvesting" },
  { name: "timeline", label: "Timeline Construction", desc: "Chronological event ordering" },
  { name: "missing_info", label: "Evidence Gaps", desc: "Missing info & incomplete links" },
  { name: "contradictions", label: "Contradiction Detection", desc: "Conflict & mismatch analysis" },
  { name: "redaction", label: "PII Sanitization", desc: "Cryptographic redaction" },
  { name: "report", label: "Incident Report", desc: "Synthesizing evidence claims" },
];

function detail(name: CaseStageName, r: StageResult): string {
  switch (name) {
    case "extraction":
      return r.processed === null ? "Awaiting files" : `${r.processed} extracted · ${r.reused} cached · ${r.failed} failed`;
    case "timeline":
      return r.events === null ? "Awaiting claims" : `${r.events} timeline events built`;
    case "missing_info":
      return r.items === null ? "Awaiting timeline" : `${r.items} gaps identified`;
    case "contradictions":
      return r.items === null ? "Awaiting claims" : `${r.items} contradictions detected`;
    case "redaction":
      return r.items === null ? "Awaiting entities" : `${r.items} items · ${r.masked} PII masked`;
    case "report":
      return r.statements === null ? "Awaiting synthesis" : `${r.statements} verified statements`;
  }
}

interface Props {
  evidenceVersion: number;
  onAnalyzed: () => void;
}

export default function CaseAnalysisPanel({ evidenceVersion, onAnalyzed }: Props) {
  const [overview, setOverview] = useState<CaseOverview | null>(null);
  const [stages, setStages] = useState<Partial<Record<CaseStageName, StageResult>>>({});
  const [result, setResult] = useState<CaseAnalysis | null>(null);
  const [running, setRunning] = useState(false);
  const [activeStage, setActiveStage] = useState<CaseStageName | null>(null);
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
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load case overview"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceVersion]);

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStages({});
    setActiveStage("extraction");
    try {
      const final = await analyzeCase((e) => {
        if (e.event === "stage") {
          setStages((prev) => ({ ...prev, [e.stage]: e.result }));
          if (e.result.status === "running") {
            setActiveStage(e.stage);
          } else if (e.result.status === "completed") {
            const nextIdx = STAGES.findIndex((s) => s.name === e.stage) + 1;
            if (nextIdx < STAGES.length) setActiveStage(STAGES[nextIdx].name);
          }
        }
      });
      setResult(final);
      setStages(final.stages);
      setActiveStage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Case analysis failed");
      setActiveStage(null);
    } finally {
      setRunning(false);
      getCaseOverview().then(setOverview).catch(() => undefined);
      onAnalyzed();
    }
  }

  const total = overview?.evidence_total ?? 0;
  const analyzed = overview?.analyzed ?? 0;
  const pending = overview?.pending ?? 0;
  const types = Object.entries(overview?.evidence_by_type ?? {});

  const timelineEvents = stages.timeline?.events ?? result?.stages.timeline?.events ?? null;
  const gapCount = stages.missing_info?.items ?? result?.stages.missing_info?.items ?? null;
  const contradictionCount = stages.contradictions?.items ?? result?.stages.contradictions?.items ?? null;
  const piiMasked = stages.redaction?.masked ?? result?.stages.redaction?.masked ?? null;

  const isAnalyzed = result !== null && !running;
  const hasErrors = (result?.errors?.length ?? 0) > 0;

  return (
    <section className="mb-8 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-md shadow-2xl relative overflow-hidden">
      {/* Top ambient highlight line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500/0 via-emerald-400/60 to-cyan-500/0" />

      {/* Header & Primary Action Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              CASE INVESTIGATION HUB
            </span>
            {result?.finished_at && (
              <span className="text-[11px] text-slate-400">
                Last run {new Date(result.finished_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Multi-Source Digital Evidence Pipeline
          </h2>
          <p className="mt-1 text-xs text-slate-400 max-w-2xl leading-relaxed">
            Autonomous ingestion, OCR extraction, chronological timeline reconstruction, gap detection, contradiction verification, and cryptographically verified incident reporting.
          </p>
        </div>

        {/* Primary Action Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={run}
            disabled={running || total === 0}
            title={total === 0 ? "Upload at least one evidence file to begin analysis" : "Execute complete forensic pipeline"}
            className={`relative group overflow-hidden rounded-lg px-7 py-3.5 text-xs font-bold uppercase tracking-[0.2em] transition-all duration-300 shadow-lg ${
              running
                ? "bg-slate-800 border border-cyan-500/50 text-cyan-300 cursor-wait shadow-cyan-900/30"
                : total === 0
                ? "bg-slate-800/60 border border-slate-700/60 text-slate-500 cursor-not-allowed"
                : "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-slate-950 hover:brightness-110 shadow-emerald-500/20 hover:shadow-emerald-500/40 active:scale-[0.98]"
            }`}
          >
            {/* Button Inner Content */}
            <span className="relative z-10 flex items-center justify-center gap-2.5">
              {running ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                  <span>ANALYZING CASE…</span>
                </>
              ) : (
                <>
                  <ActivityIcon className="h-4 w-4 stroke-[2.5]" />
                  <span>ANALYZE ENTIRE CASE</span>
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Compact Metrics Grid */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Uploaded Evidence */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase">Evidence Items</span>
            <FileIcon className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            {overview === null ? "--" : String(total).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 truncate">
            {types.length > 0 ? types.map(([t, n]) => `${n} ${t}`).join(", ") : "No files loaded"}
          </div>
        </div>

        {/* Metric 2: Processing Status */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase">Pipeline State</span>
            <ActivityIcon className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="text-sm font-bold truncate mt-1">
            {running ? (
              <span className="text-cyan-300 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
                PROCESSING
              </span>
            ) : isAnalyzed ? (
              hasErrors ? (
                <span className="text-amber-300 flex items-center gap-1">
                  <AlertCircleIcon className="h-3.5 w-3.5" /> WITH NOTICES
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckIcon className="h-3.5 w-3.5" /> VERIFIED
                </span>
              )
            ) : total > 0 ? (
              <span className="text-amber-400 font-medium">READY TO RUN</span>
            ) : (
              <span className="text-slate-500 font-medium">AWAITING DATA</span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            {analyzed} analyzed · {pending} pending
          </div>
        </div>

        {/* Metric 3: Timeline Events */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase">Timeline Events</span>
            <TimelineIcon className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {timelineEvents === null ? "--" : String(timelineEvents).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 truncate">
            {timelineEvents === null ? "Pending run" : `${timelineEvents} reconstructed`}
          </div>
        </div>

        {/* Metric 4: Gaps & Missing Info */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase">Evidence Gaps</span>
            <AlertCircleIcon className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className={`text-xl font-bold font-mono ${gapCount && gapCount > 0 ? "text-amber-400" : "text-slate-100"}`}>
            {gapCount === null ? "--" : String(gapCount).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 truncate">
            {gapCount === null ? "Pending run" : gapCount === 0 ? "Zero gaps flagged" : `${gapCount} requiring review`}
          </div>
        </div>

        {/* Metric 5: Contradictions */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase">Contradictions</span>
            {contradictionCount && contradictionCount > 0 ? (
              <ShieldAlertIcon className="h-3.5 w-3.5 text-rose-400" />
            ) : (
              <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-400" />
            )}
          </div>
          <div className={`text-xl font-bold font-mono ${contradictionCount && contradictionCount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
            {contradictionCount === null ? "--" : String(contradictionCount).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 truncate">
            {contradictionCount === null
              ? "Pending run"
              : contradictionCount === 0
              ? "All claims consistent"
              : `${contradictionCount} conflicts flagged`}
          </div>
        </div>

        {/* Metric 6: PII Redaction */}
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase">PII Masked</span>
            <LockIcon className="h-3.5 w-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-300">
            {piiMasked === null ? "--" : String(piiMasked).padStart(2, "0")}
          </div>
          <div className="mt-1 text-[10px] text-slate-400 truncate">
            {piiMasked === null ? "Pending run" : "Cryptographically safe"}
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
          <CrossIcon className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Pipeline Stage Stepper */}
      {(running || isAnalyzed) && (
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-widest uppercase text-slate-400 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Investigation Pipeline Execution Stages
            </span>
            {running && (
              <span className="text-[11px] text-cyan-300 font-mono animate-pulse">
                STAGE: {activeStage ? activeStage.toUpperCase() : "PROCESSING"}
              </span>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map(({ name, label, desc }, idx) => {
              const r = stages[name];
              const status: StageStatus = r?.status ?? "pending";
              const isCurrent = running && activeStage === name;

              return (
                <div
                  key={name}
                  className={`relative rounded-lg border p-3 transition-all ${
                    isCurrent
                      ? "border-cyan-500/60 bg-cyan-950/30 shadow-[0_0_16px_-4px_rgba(6,182,212,0.4)]"
                      : status === "completed"
                      ? "border-emerald-500/30 bg-slate-950/70"
                      : status === "failed"
                      ? "border-rose-500/40 bg-rose-950/20"
                      : "border-slate-800/80 bg-slate-950/40 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-500">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h4 className="text-xs font-semibold text-slate-200">{label}</h4>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {isCurrent || status === "running" ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                      ) : status === "completed" ? (
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400">
                          <CheckIcon className="h-3 w-3" />
                        </span>
                      ) : status === "failed" ? (
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-rose-500/20 text-rose-400">
                          <CrossIcon className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-slate-700 inline-block" />
                      )}
                    </div>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-400 truncate">{desc}</p>

                  {/* Telemetry / output detail */}
                  {r && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                      <span className={`font-mono ${r.error ? "text-rose-400" : "text-emerald-400/90"}`}>
                        {r.error ?? detail(name, r)}
                      </span>
                      {r.duration_ms !== null && (
                        <span className="text-slate-400 font-mono">{r.duration_ms}ms</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Analysis Result Banner & Quick Jump Bar */}
      {result && !running && (
        <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                <CheckIcon className="h-4 w-4 stroke-[2.5]" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    {result.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({result.evidence_analyzed} of {result.evidence_total} files verified)
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Full forensic case analysis executed. Jump to any module below to inspect findings.
                </p>
              </div>
            </div>

            {/* Quick Jump Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#section-evidence"
                className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition"
              >
                Evidence ({total})
              </a>
              <a
                href="#section-timeline"
                className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 transition"
              >
                Timeline ({timelineEvents ?? 0})
              </a>
              <a
                href="#section-gaps"
                className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-amber-500/50 hover:text-amber-300 transition"
              >
                Gaps ({gapCount ?? 0})
              </a>
              <a
                href="#section-contradictions"
                className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-rose-500/50 hover:text-rose-300 transition"
              >
                Contradictions ({contradictionCount ?? 0})
              </a>
              <a
                href="#section-redaction"
                className="rounded border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition"
              >
                Redaction ({piiMasked ?? 0})
              </a>
              <a
                href="#section-report"
                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition flex items-center gap-1"
              >
                <ReportIcon className="h-3 w-3" /> Report
              </a>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mt-3 border-t border-amber-500/20 pt-3">
              <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertCircleIcon className="h-3.5 w-3.5" /> Notice &amp; Diagnostics ({result.errors.length}):
              </span>
              <ul className="mt-1 space-y-1 text-[11px] text-amber-200/90 font-mono">
                {result.errors.map((e, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="text-amber-400">⚠</span>
                    {e.evidence_id ? (
                      <a href={`#evidence-${e.evidence_id}`} className="underline text-amber-300 hover:text-white">
                        [{e.evidence_id}]
                      </a>
                    ) : (
                      <span className="uppercase font-semibold">[{e.stage}]</span>
                    )}
                    : {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

