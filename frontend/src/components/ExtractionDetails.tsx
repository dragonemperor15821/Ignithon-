import { useState } from "react";
import type { EntityType, ExtractionResult } from "../api";
import { CheckIcon, CopyIcon, FileIcon } from "./Icons";

const ENTITY_LABEL: Record<EntityType, { label: string; badge: string }> = {
  datetime: { label: "Timestamp", badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
  date: { label: "Date", badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
  time: { label: "Time", badge: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30" },
  amount: { label: "Amount", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  url: { label: "URL", badge: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  transaction_id: { label: "Tx ID", badge: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  phone_number: { label: "Phone", badge: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  email_address: { label: "Email", badge: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

type Tab = "claims" | "entities" | "text";

export default function ExtractionDetails({ result }: { result: ExtractionResult }) {
  const [tab, setTab] = useState<Tab>("claims");
  const [copiedText, setCopiedText] = useState(false);

  async function copyText() {
    if (!result.extracted_text) return;
    try {
      await navigator.clipboard.writeText(result.extracted_text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-xs">
      {/* Telemetry header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 text-slate-400 font-mono text-[11px]">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            METHOD: <strong className="text-slate-200">{result.method ?? "—"}</strong>
          </span>
          <span>·</span>
          <span>
            CAPTURE CONFIDENCE:{" "}
            <strong className="text-emerald-400">
              {result.confidence === null ? "—" : pct(result.confidence)}
            </strong>
          </span>
          <span>·</span>
          <span>EXTRACTED: {new Date(result.extracted_at).toLocaleTimeString()}</span>
        </div>
      </div>

      {result.notes.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300 text-[11px] font-mono">
          {result.notes.map((n, i) => (
            <li key={i}>⚠ {n}</li>
          ))}
        </ul>
      )}

      {/* Tabs */}
      <div className="mt-4 flex items-center gap-1 border-b border-slate-800">
        <button
          onClick={() => setTab("claims")}
          className={`px-3 py-2 text-xs font-semibold tracking-wider transition border-b-2 -mb-[1px] flex items-center gap-1.5 ${
            tab === "claims"
              ? "border-emerald-400 text-emerald-300 bg-emerald-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>CLAIMS</span>
          <span className="rounded-full bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] text-slate-300">
            {result.claims.length}
          </span>
        </button>

        <button
          onClick={() => setTab("entities")}
          className={`px-3 py-2 text-xs font-semibold tracking-wider transition border-b-2 -mb-[1px] flex items-center gap-1.5 ${
            tab === "entities"
              ? "border-emerald-400 text-emerald-300 bg-emerald-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>ENTITIES</span>
          <span className="rounded-full bg-slate-800 px-1.5 py-0.2 font-mono text-[10px] text-slate-300">
            {result.entities.length}
          </span>
        </button>

        <button
          onClick={() => setTab("text")}
          className={`px-3 py-2 text-xs font-semibold tracking-wider transition border-b-2 -mb-[1px] flex items-center gap-1.5 ${
            tab === "text"
              ? "border-emerald-400 text-emerald-300 bg-emerald-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>EXTRACTED TEXT</span>
          {result.text_truncated && (
            <span className="rounded bg-amber-500/20 px-1 font-mono text-[9px] text-amber-300">TRUNCATED</span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div className="mt-4">
        {tab === "claims" && (
          <div>
            {result.claims.length === 0 ? (
              <p className="text-slate-400 py-3 text-center">No explicit factual claims detected in this evidence.</p>
            ) : (
              <ul className="space-y-2.5">
                {result.claims.map((c) => (
                  <li key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-400">[{c.id}]</span>
                        <span className="text-slate-400">SOURCES:</span>
                        {c.source_evidence_ids.map((id) => (
                          <span key={id} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                            {id}
                          </span>
                        ))}
                      </div>
                      <span className="text-slate-400">CONFIDENCE: {pct(c.confidence)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-slate-200 font-sans text-xs leading-relaxed">
                      “{c.claim}”
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "entities" && (
          <div>
            {result.entities.length === 0 ? (
              <p className="text-slate-400 py-3 text-center">No structured entities identified in this evidence.</p>
            ) : (
              <div className="overflow-x-auto rounded border border-slate-800/80">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Entity Type</th>
                      <th className="py-2 px-3">Raw Value</th>
                      <th className="py-2 px-3">Normalized Representation</th>
                      <th className="py-2 px-3 text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
                    {result.entities.map((e) => {
                      const entBadge = ENTITY_LABEL[e.type] ?? {
                        label: e.type,
                        badge: "bg-slate-800 text-slate-300 border-slate-700",
                      };
                      return (
                        <tr key={e.id} className="hover:bg-slate-900/40 transition">
                          <td className="py-2 px-3">
                            <span className={`inline-block rounded border px-2 py-0.5 text-[10px] uppercase ${entBadge.badge}`}>
                              {entBadge.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 break-all text-slate-200 font-semibold">{e.raw}</td>
                          <td className="py-2 px-3 break-all text-slate-400">
                            {e.normalized === null ? (
                              <span className="text-slate-400 italic">unnormalized (conservative)</span>
                            ) : (
                              <span className="text-slate-200">
                                {e.unit && <span className="text-slate-400">{e.unit} </span>}
                                {e.normalized}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-400 font-bold">{pct(e.confidence)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "text" && (
          <div>
            {result.extracted_text === null ? (
              <p className="text-slate-400 py-3 text-center">Extracted text unavailable for this item.</p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                    <FileIcon className="h-3 w-3 text-emerald-400" />
                    Plain Text Representation
                  </span>
                  <button
                    onClick={copyText}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:text-emerald-300 hover:border-emerald-500/50 transition font-mono"
                  >
                    {copiedText ? (
                      <>
                        <CheckIcon className="h-3 w-3 text-emerald-400" />
                        <span>COPIED</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-3 w-3" />
                        <span>COPY TEXT</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900/90 p-3 font-mono text-[11px] text-slate-300 leading-relaxed">
                  {result.extracted_text || "(empty document body)"}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

