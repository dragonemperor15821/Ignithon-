import { useEffect, useState } from "react";
import { getTimeline, runTimeline, type Timeline, type TimelineEvent, type TimelineStatus } from "../api";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_STYLE: Record<TimelineStatus, string> = {
  pending: "bg-slate-800 text-slate-500 border-slate-700",
  ready: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  empty: "bg-amber-500/10 text-amber-300 border-amber-500/40",
};

// Formatted from the ISO string directly so no timezone shift can move the day.
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

function displayTime(e: TimelineEvent): string | null {
  if (!e.time) return null;
  // Show the wording from the evidence when the time was written on its own.
  return e.time_raw && e.time_raw !== e.date_raw ? e.time_raw : e.time;
}

function EventCard({ event }: { event: TimelineEvent }) {
  const time = displayTime(event);
  return (
    <li className="relative pl-6">
      <span className="absolute left-[-5px] top-2 h-2.5 w-2.5 rounded-full border border-emerald-400 bg-slate-950 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
      <div className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs transition hover:border-emerald-500/50">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="font-bold tracking-wider text-emerald-400">{event.id}</span>
          <span className={time ? "text-slate-200" : "text-slate-600"}>{time ?? "time unknown"}</span>
          {event.placement === "undated" && event.date_raw && (
            <span className="text-amber-300" title="Stated in the evidence but not normalized">
              date “{event.date_raw}” unresolved
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-slate-200">“{event.description}”</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] tracking-wider">
          <span className="text-slate-500">
            SOURCE{" "}
            {event.source_evidence_ids.map((id) => (
              <a
                key={id}
                href={`#evidence-${id}`}
                className="ml-1 rounded border border-emerald-500/40 px-1.5 text-emerald-300 hover:bg-emerald-500/10"
              >
                {id}
              </a>
            ))}
          </span>
          <span className="text-slate-500">
            CLAIM{" "}
            {event.source_claim_ids.map((id) => (
              <span key={id} className="ml-1 text-slate-300">
                {id}
              </span>
            ))}
          </span>
        </div>
        {event.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300/80">
            {event.notes.map((n, i) => (
              <li key={i}>⚠ {n}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function TimelineSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    getTimeline()
      .then(setTimeline)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load timeline"));
  }, [refreshKey]);

  async function build() {
    setBuilding(true);
    try {
      setTimeline(await runTimeline());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timeline build failed");
    } finally {
      setBuilding(false);
    }
  }

  const status = timeline?.status ?? "pending";
  const events = timeline?.events ?? [];
  const dated = events.filter((e) => e.placement === "dated");
  const undated = events.filter((e) => e.placement === "undated");
  const days = [...new Set(dated.map((e) => e.date!))];

  return (
    <section className="mb-5 rounded-lg border border-emerald-500/30 bg-slate-900/60 p-5 shadow-[0_0_32px_-12px_rgba(16,185,129,0.4)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs text-emerald-500/70">[02]</span>
          <h2 className="text-lg font-semibold tracking-[0.2em] text-slate-100">TIMELINE</h2>
          <p className="text-2xl font-bold text-emerald-400">
            {timeline === null ? "--" : String(events.length).padStart(2, "0")}{" "}
            <span className="text-sm tracking-widest text-slate-400">EVENTS</span>
          </p>
          {timeline?.generated_at && (
            <p className="mt-1 text-xs tracking-wider text-slate-500">
              <span className="text-emerald-400">{String(dated.length).padStart(2, "0")}</span> DATED ·{" "}
              <span className="text-amber-300">{String(undated.length).padStart(2, "0")}</span> UNKNOWN DATE · built{" "}
              {new Date(timeline.generated_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${STATUS_STYLE[status]}`}>
            {status}
          </span>
          <button
            onClick={build}
            disabled={building}
            title="Rebuild only the timeline (manual)"
            className="rounded border border-slate-700 px-3 py-1.5 text-[10px] tracking-widest text-slate-400 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {building ? "BUILDING…" : timeline?.generated_at ? "[ REBUILD TIMELINE ]" : "[ BUILD TIMELINE ]"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          ✕ {error}
        </p>
      )}

      {status !== "ready" ? (
        <div className="flex h-24 flex-col items-center justify-center gap-1 rounded border border-dashed border-slate-700 text-xs text-slate-500">
          <span>
            {status === "pending"
              ? "No timeline yet — analyze evidence, then build the timeline."
              : "No timeline events could be constructed from the extracted claims."}
          </span>
          {timeline?.notes.map((n, i) => (
            <span key={i} className="text-slate-600">
              {n}
            </span>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day}>
              <h3 className="mb-2 text-sm font-bold tracking-[0.2em] text-slate-100">{formatDate(day)}</h3>
              <ol className="ml-2 space-y-3 border-l border-emerald-500/30">
                {dated
                  .filter((e) => e.date === day)
                  .map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
              </ol>
            </div>
          ))}

          {undated.length > 0 && (
            <div>
              <h3 className="text-sm font-bold tracking-[0.2em] text-amber-300">UNKNOWN DATE</h3>
              <p className="mb-2 text-[11px] text-slate-500">
                No usable date is stated for these events. They are listed by ID, not in chronological order.
              </p>
              <ol className="ml-2 space-y-3 border-l border-dashed border-slate-700">
                {undated.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
