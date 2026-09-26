import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AnalysisStatus } from "../api";

const STATUS_STYLE: Record<AnalysisStatus, string> = {
  pending: "bg-slate-800 text-slate-500 border-slate-700",
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  empty: "bg-amber-500/10 text-amber-300 border-amber-500/40",
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

export function SourceRefs({ evidence = [], claims = [], events = [] }: { evidence?: string[]; claims?: string[]; events?: string[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-wider text-slate-500">
      {evidence.length > 0 && (
        <span>
          SOURCE
          {evidence.map((id) => (
            <a key={id} href={`#evidence-${id}`} className="ml-1 rounded border border-emerald-500/40 px-1.5 text-emerald-300 hover:bg-emerald-500/10">
              {id}
            </a>
          ))}
        </span>
      )}
      {claims.length > 0 && <span>CLAIM <span className="text-slate-300">{claims.join(" ")}</span></span>}
      {events.length > 0 && <span>EVENT <span className="text-slate-300">{events.join(" ")}</span></span>}
    </div>
  );
}

interface Props {
  id: string;
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
  return (
    <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs text-emerald-500/70">[{p.id}]</span>
          <h2 className="text-lg font-semibold tracking-[0.2em] text-slate-100">{p.title.toUpperCase()}</h2>
          <p className="text-2xl font-bold text-emerald-400">
            {p.count === null ? "--" : String(p.count).padStart(2, "0")}{" "}
            <span className="text-sm tracking-widest text-slate-400">{p.unit}</span>
          </p>
          {p.subtitle && <div className="mt-1 text-xs tracking-wider text-slate-500">{p.subtitle}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLE[status]}`}>{status}</span>
          {p.actions}
          <button
            onClick={p.onRun}
            disabled={p.busy}
            title="Re-run only this stage (manual)"
            className="rounded border border-slate-700 px-3 py-1.5 text-[10px] tracking-widest text-slate-400 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {p.busy ? "RUNNING…" : `[ ${p.runLabel} ]`}
          </button>
        </div>
      </div>

      {p.error && (
        <p className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">✕ {p.error}</p>
      )}

      {status !== "ready" ? (
        <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded border border-dashed border-slate-700 p-3 text-center text-xs text-slate-500">
          <span>{p.emptyText}</span>
          {p.notes?.map((n, i) => (
            <span key={i} className="text-slate-600">{n}</span>
          ))}
        </div>
      ) : (
        p.children
      )}
    </section>
  );
}
