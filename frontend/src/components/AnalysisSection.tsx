import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AnalysisStatus } from "../api";
import { CrossIcon, ShieldCheckIcon } from "./Icons";

const STATUS_BADGE: Record<AnalysisStatus, { label: string; style: string; dot: string }> = {
  pending: {
    label: "Awaiting Run",
    style: "bg-slate-800/80 text-slate-400 border-slate-700/80",
    dot: "bg-slate-500",
  },
  ready: {
    label: "Verified Ready",
    style: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  empty: {
    label: "Zero Findings",
    style: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    dot: "bg-cyan-400",
  },
};

/** Load the saved result on mount; `run` recomputes it on the backend. */
export function useAnalysis<T>(load: () => Promise<T>, run: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const execute = useCallback(async () => {
    setBusy(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }, [run]);

  return { data, error, busy, execute };
}

export function SourceRefs({
  evidence = [],
  claims = [],
  events = [],
}: {
  evidence?: string[];
  claims?: string[];
  events?: string[];
}) {
  if (evidence.length === 0 && claims.length === 0 && events.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
      {evidence.length > 0 && (
        <span className="flex items-center gap-1 text-slate-400">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">SRC:</span>
          {evidence.map((id) => (
            <a
              key={id}
              href={`#evidence-${id}`}
              className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/25 hover:border-emerald-400"
              title={`Jump to evidence ${id}`}
            >
              {id}
            </a>
          ))}
        </span>
      )}
      {claims.length > 0 && (
        <span className="flex items-center gap-1 text-slate-400 ml-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CLM:</span>
          {claims.map((c) => (
            <span key={c} className="rounded border border-slate-700/80 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300">
              {c}
            </span>
          ))}
        </span>
      )}
      {events.length > 0 && (
        <span className="flex items-center gap-1 text-slate-400 ml-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">EVT:</span>
          {events.map((ev) => (
            <span key={ev} className="rounded border border-cyan-800/60 bg-cyan-950/40 px-1.5 py-0.5 text-[10px] text-cyan-300">
              {ev}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

interface Props {
  id: string;
  htmlId?: string;
  title: string;
  count: number | null;
  unit: string;
  status: AnalysisStatus | undefined;
  busy: boolean;
  error: string | null;
  runLabel: string;
  onRun: () => void;
  emptyText: string;
  notes?: string[];
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function AnalysisSection(p: Props) {
  const status = p.status ?? "pending";
  const badge = STATUS_BADGE[status];
  const sectionAnchorId = p.htmlId ?? `section-${p.id}`;

  return (
    <section
      id={sectionAnchorId}
      className="mb-8 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 md:p-6 backdrop-blur-md shadow-xl transition-all duration-200 hover:border-slate-700/80"
    >
      {/* Section Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
              [{p.id}]
            </span>
            <h2 className="text-base md:text-lg font-bold tracking-tight text-white uppercase">{p.title}</h2>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {p.count === null ? "--" : String(p.count).padStart(2, "0")}
            </span>
            <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">{p.unit}</span>
          </div>

          {p.subtitle && <div className="mt-1 text-xs text-slate-400">{p.subtitle}</div>}
        </div>

        {/* Action Controls & Status */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase ${badge.style}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot} ${status === "ready" ? "animate-pulse" : ""}`} />
            {badge.label}
          </span>

          {p.actions}

          <button
            onClick={p.onRun}
            disabled={p.busy}
            title="Re-run only this investigation stage"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold tracking-wider text-slate-300 transition hover:border-emerald-500/50 hover:bg-slate-800 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {p.busy ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                <span>PROCESSING…</span>
              </>
            ) : (
              <span>{p.runLabel}</span>
            )}
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {p.error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
          <CrossIcon className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{p.error}</span>
        </div>
      )}

      {/* Empty State vs Content */}
      {status !== "ready" ? (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
          {status === "empty" ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-2.5">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-200">Analysis Complete — No Items Detected</p>
              <p className="mt-1 max-w-md text-xs text-slate-400">{p.emptyText}</p>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 mb-2.5">
                <span className="font-mono text-sm font-bold">--</span>
              </div>
              <p className="text-sm font-semibold text-slate-300">Stage Pending Execution</p>
              <p className="mt-1 max-w-md text-xs text-slate-400">{p.emptyText}</p>
            </>
          )}

          {p.notes && p.notes.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {p.notes.map((n, i) => (
                <span key={i} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-400 font-mono">
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        p.children
      )}
    </section>
  );
}

