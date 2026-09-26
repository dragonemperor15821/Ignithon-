import { useEffect, useMemo, useState } from "react";
import { getTimeline, runTimeline, type Timeline, type TimelineEvent, type TimelineStatus } from "../api";
import {
  AlertCircleIcon,
  CrossIcon,
  SearchIcon,
  ShieldCheckIcon,
  TimelineIcon,
} from "./Icons";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const STATUS_BADGE: Record<TimelineStatus, { label: string; style: string; dot: string }> = {
  pending: { label: "Pending Build", style: "bg-slate-800 text-slate-400 border-slate-700", dot: "bg-slate-500" },
  ready: { label: "Chronology Verified", style: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  empty: { label: "No Temporal Events", style: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30", dot: "bg-cyan-400" },
};

function formatDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function displayTime(e: TimelineEvent): string | null {
  if (!e.time) return null;
  return e.time_raw && e.time_raw !== e.date_raw ? e.time_raw : e.time;
}

function EventCard({ event }: { event: TimelineEvent }) {
  const time = displayTime(event);
  const isDated = event.placement === "dated";

  return (
    <li className="relative pl-7 group">
      {/* Node Marker */}
      <span
        className={`absolute -left-[5px] top-3.5 h-3 w-3 rounded-full border-2 transition-all duration-200 group-hover:scale-125 ${
          isDated
            ? "border-emerald-400 bg-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
            : "border-amber-400 bg-slate-950 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
        }`}
      />

      <div className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 text-xs transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/60 shadow-md">
        {/* Top Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
              {event.id}
            </span>

            {time ? (
              <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">
                <TimelineIcon className="h-3 w-3 text-cyan-400" />
                {time}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-slate-400 italic">time unspecified</span>
            )}

            {event.placement === "undated" && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Undated
              </span>
            )}
          </div>

          {event.placement === "undated" && event.date_raw && (
            <span className="text-[11px] font-mono text-amber-300/90" title="Stated in raw evidence but not normalized into standard calendar format">
              ⚠ Unresolved date literal: “{event.date_raw}”
            </span>
          )}
        </div>

        {/* Event Statement Description */}
        <p className="mt-3 text-slate-200 font-sans text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
          “{event.description}”
        </p>

        {/* Source References */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex flex-wrap items-center gap-3 text-[11px] font-mono">
          {event.source_evidence_ids.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <span className="text-[10px] uppercase font-bold text-slate-400">SRC:</span>
              {event.source_evidence_ids.map((id) => (
                <a
                  key={id}
                  href={`#evidence-${id}`}
                  className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-400 transition"
                >
                  {id}
                </a>
              ))}
            </div>
          )}

          {event.source_claim_ids.length > 0 && (
            <div className="flex items-center gap-1 text-slate-400">
              <span className="text-[10px] uppercase font-bold text-slate-400">CLAIMS:</span>
              {event.source_claim_ids.map((id) => (
                <span key={id} className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Diagnostic Notes */}
        {event.notes.length > 0 && (
          <ul className="mt-2.5 space-y-1 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200 font-mono">
            {event.notes.map((n, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <AlertCircleIcon className="h-3 w-3 text-amber-400 shrink-0" />
                <span>{n}</span>
              </li>
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
  const [search, setSearch] = useState("");

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
  const badge = STATUS_BADGE[status];
  const events = timeline?.events ?? [];

  // Filter events by search
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.date && e.date.toLowerCase().includes(q)) ||
        (e.time && e.time.toLowerCase().includes(q)) ||
        e.source_evidence_ids.some((id) => id.toLowerCase().includes(q)),
    );
  }, [events, search]);

  const dated = filteredEvents.filter((e) => e.placement === "dated");
  const undated = filteredEvents.filter((e) => e.placement === "undated");
  const days = [...new Set(dated.map((e) => e.date!))];

  return (
    <section
      id="section-timeline"
      className="mb-8 rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 md:p-6 backdrop-blur-md shadow-xl transition-all duration-200 hover:border-slate-700/80"
    >
      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
              [02]
            </span>
            <h2 className="text-base md:text-lg font-bold tracking-tight text-white uppercase">
              CHRONOLOGICAL RECONSTRUCTION
            </h2>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {timeline === null ? "--" : String(events.length).padStart(2, "0")}
            </span>
            <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
              TIMELINE EVENTS
            </span>
          </div>

          {timeline?.generated_at && (
            <p className="mt-1 text-xs text-slate-400">
              <span className="text-emerald-400 font-mono font-semibold">{dated.length}</span> dated sequence points ·{" "}
              <span className={undated.length > 0 ? "text-amber-400 font-mono font-semibold" : "text-slate-400 font-mono"}>
                {undated.length}
              </span>{" "}
              undated claims · reconstructed {new Date(timeline.generated_at).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase ${badge.style}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot} ${status === "ready" ? "animate-pulse" : ""}`} />
            {badge.label}
          </span>

          <button
            onClick={build}
            disabled={building}
            title="Rebuild timeline from extracted claims"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold tracking-wider text-slate-300 transition hover:border-emerald-500/50 hover:bg-slate-800 hover:text-emerald-300 disabled:cursor-wait disabled:opacity-60"
          >
            {building ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                <span>BUILDING…</span>
              </>
            ) : timeline?.generated_at ? (
              <span>REBUILD TIMELINE</span>
            ) : (
              <span>BUILD TIMELINE</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
          <CrossIcon className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter / Search within timeline */}
      {status === "ready" && events.length > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 max-w-md">
          <SearchIcon className="h-3.5 w-3.5 text-slate-400 ml-1" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search timeline events, IDs, or dates…"
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-400 focus:outline-none font-mono"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[10px] text-slate-400 hover:text-white font-mono px-1">
              clear
            </button>
          )}
        </div>
      )}

      {status !== "ready" ? (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
          {status === "empty" ? (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-2.5">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-200">No Chronological Events Detected</p>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                No temporal event claims could be synthesized from the currently extracted evidence.
              </p>
            </>
          ) : (
            <>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 mb-2.5">
                <TimelineIcon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-slate-300">Timeline Awaiting Construction</p>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Upload evidence and run case analysis to automatically sequence chronological events.
              </p>
            </>
          )}

          {timeline?.notes && timeline.notes.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {timeline.notes.map((n, i) => (
                <span key={i} className="rounded border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-400 font-mono">
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Dated Day Blocks */}
          {days.map((day) => {
            const dayEvents = dated.filter((e) => e.date === day);
            return (
              <div key={day} className="relative">
                {/* Milestone Day Header */}
                <div className="sticky top-2 z-10 mb-4 inline-flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 backdrop-blur-md shadow-md">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="font-mono text-xs font-bold tracking-wider text-emerald-300">
                    {formatDate(day)}
                  </h3>
                  <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] text-slate-400">
                    {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                  </span>
                </div>

                {/* Vertical Spine & Nodes */}
                <ol className="relative ml-2 space-y-4 border-l-2 border-emerald-500/30 pl-1">
                  {dayEvents.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </ol>
              </div>
            );
          })}

          {/* Undated Events Block */}
          {undated.length > 0 && (
            <div className="relative pt-4 border-t border-slate-800/80">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                  UNDATED OR UNRESOLVED CLAIMS ({undated.length})
                </span>
              </div>
              <p className="mb-4 text-xs text-slate-400">
                The following statements lack a verified calendar timestamp. They are preserved by Evidence ID to prevent speculation.
              </p>
              <ol className="relative ml-2 space-y-4 border-l-2 border-dashed border-amber-500/30 pl-1">
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

