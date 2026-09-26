import { useState } from "react";
import { getRedactions, runRedactions, type RedactedEvidence } from "../api";
import AnalysisSection, { SourceRefs, useAnalysis } from "./AnalysisSection";
import { CheckIcon, CopyIcon, LockIcon, ShieldCheckIcon } from "./Icons";

function RedactedItemCard({
  item,
  isOpen,
  onToggle,
}: {
  item: RedactedEvidence;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyRedactedText() {
    if (!item.redacted_text) return;
    try {
      await navigator.clipboard.writeText(item.redacted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  const countsList = Object.entries(item.counts);

  return (
    <li className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-4 text-xs transition-all duration-200 hover:border-slate-700 shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <LockIcon className="h-3.5 w-3.5" />
          </span>
          <SourceRefs evidence={[item.evidence_id]} />
          <span className="rounded-full border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300 font-mono">
            {item.status}
          </span>
        </div>

        {item.redacted_text && (
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold tracking-wider text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition"
          >
            {isOpen ? "HIDE SANITIZED TEXT" : "VIEW SANITIZED TEXT"}
          </button>
        )}
      </div>

      {/* Masked entity summary badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono text-slate-400 uppercase">Masked Fields:</span>
        {countsList.length > 0 ? (
          countsList.map(([type, count]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900/90 px-2 py-0.5 font-mono text-[10px] text-cyan-300"
            >
              <span className="font-bold text-white">{count}</span>
              <span className="text-slate-400 uppercase">{type}</span>
            </span>
          ))
        ) : (
          <span className="text-[11px] text-slate-400 italic">
            {item.notes[0] ?? "Zero PII entities detected for redaction"}
          </span>
        )}
      </div>

      {/* Cryptographic reference */}
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
        <ShieldCheckIcon className="h-3 w-3 text-emerald-400 shrink-0" />
        <span className="truncate">
          Derived from original SHA-256 <code className="text-slate-400">{item.source_sha256}</code>
        </span>
      </div>

      {/* Expandable sanitized text view */}
      {isOpen && item.redacted_text && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 animate-in fade-in duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-cyan-400 uppercase font-semibold flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Sanitized Output (Derived Copy)
            </span>
            <button
              onClick={copyRedactedText}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white font-mono transition"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-300">COPIED</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3 w-3" />
                  <span>COPY SANITIZED</span>
                </>
              )}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900/90 p-3 font-mono text-[11px] text-slate-200 leading-relaxed">
            {item.redacted_text}
          </pre>
        </div>
      )}
    </li>
  );
}

export default function RedactionSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, busy, execute } = useAnalysis(getRedactions, runRedactions, [refreshKey]);
  const [openId, setOpenId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const totalMasked = items.reduce((n, i) => n + i.spans.length, 0);

  return (
    <AnalysisSection
      id="05"
      htmlId="section-redaction"
      title="Cryptographic PII Redaction"
      count={data ? totalMasked : null}
      unit="MASKED IDENTIFIERS"
      status={data?.status}
      busy={busy}
      error={error}
      runLabel={data?.generated_at ? "RE-EXECUTE REDACTION" : "EXECUTE REDACTION"}
      onRun={execute}
      emptyText="No redacted copies generated yet. Run case analysis to identify PII and produce sanitized working copies."
      notes={data?.notes}
      subtitle={
        data?.generated_at && (
          <span className="font-mono text-slate-400">
            {items.length} evidence artifacts evaluated · derived copies only; original files and SHA-256 hashes immutable
          </span>
        )
      }
    >
      <ul className="space-y-3">
        {items.map((i) => (
          <RedactedItemCard
            key={i.evidence_id}
            item={i}
            isOpen={openId === i.evidence_id}
            onToggle={() => setOpenId(openId === i.evidence_id ? null : i.evidence_id)}
          />
        ))}
      </ul>
    </AnalysisSection>
  );
}

