import type { EntityType, ExtractionResult } from "../api";

const ENTITY_LABEL: Record<EntityType, string> = {
  datetime: "Timestamp",
  date: "Date",
  time: "Time",
  amount: "Amount",
  url: "URL",
  transaction_id: "Transaction ID",
  phone_number: "Phone",
  email_address: "Email",
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function ExtractionDetails({ result }: { result: ExtractionResult }) {
  return (
    <div className="mt-3 space-y-4 border-t border-slate-800 pt-3 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
        <span>
          method <span className="text-slate-300">{result.method ?? "—"}</span>
        </span>
        <span>
          capture confidence{" "}
          <span className="text-slate-300">{result.confidence === null ? "—" : pct(result.confidence)}</span>
        </span>
        <span>
          extracted <span className="text-slate-300">{new Date(result.extracted_at).toLocaleString()}</span>
        </span>
      </div>

      {result.notes.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-300">
          {result.notes.map((n, i) => (
            <li key={i}>⚠ {n}</li>
          ))}
        </ul>
      )}

      <div>
        <h4 className="mb-1 tracking-widest text-emerald-400">CLAIMS ({result.claims.length})</h4>
        {result.claims.length === 0 ? (
          <p className="text-slate-600">No claims found in this evidence.</p>
        ) : (
          <ul className="space-y-2">
            {result.claims.map((c) => (
              <li key={c.id} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="font-bold text-emerald-400">{c.id}</span>
                  <span className="text-slate-500">source</span>
                  {c.source_evidence_ids.map((id) => (
                    <span key={id} className="rounded border border-emerald-500/40 px-1.5 text-emerald-300">
                      {id}
                    </span>
                  ))}
                  <span className="text-slate-500">conf {pct(c.confidence)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-slate-200">“{c.claim}”</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-1 tracking-widest text-emerald-400">ENTITIES ({result.entities.length})</h4>
        {result.entities.length === 0 ? (
          <p className="text-slate-600">No entities detected.</p>
        ) : (
          <table className="w-full table-fixed">
            <tbody>
              {result.entities.map((e) => (
                <tr key={e.id} className="border-b border-slate-800/60 align-top">
                  <td className="w-28 py-1 text-slate-500">{ENTITY_LABEL[e.type]}</td>
                  <td className="py-1 break-all text-slate-200">{e.raw}</td>
                  <td className="w-32 py-1 break-all text-slate-400">
                    {e.normalized === null ? (
                      <span className="text-slate-600" title="Not normalized: would require guessing">
                        unnormalized
                      </span>
                    ) : (
                      <>
                        {e.unit && <span className="text-slate-500">{e.unit} </span>}
                        {e.normalized}
                      </>
                    )}
                  </td>
                  <td className="w-12 py-1 text-right text-slate-500">{pct(e.confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h4 className="mb-1 tracking-widest text-emerald-400">
          EXTRACTED TEXT{result.text_truncated && <span className="text-amber-400"> (truncated)</span>}
        </h4>
        {result.extracted_text === null ? (
          <p className="text-slate-600">Text unavailable for this evidence.</p>
        ) : (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded border border-slate-800 bg-slate-950/80 p-2 text-slate-300">
            {result.extracted_text || "(empty)"}
          </pre>
        )}
      </div>
    </div>
  );
}
