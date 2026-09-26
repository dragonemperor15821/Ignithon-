import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, uploadEvidence, type RejectedFile } from "../api";

interface Props {
  onUploaded: () => void;
}

export default function EvidenceUpload({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);

  async function handleFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    setRejected([]);
    try {
      const res = await uploadEvidence(files);
      setRejected(res.rejected);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_32px_-8px_rgba(16,185,129,0.7)]"
            : "border-slate-700 bg-slate-950/40 hover:border-emerald-500/60"
        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        {uploading ? (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
            <p className="mt-3 text-sm tracking-widest text-emerald-400">HASHING &amp; REGISTERING…</p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold tracking-[0.25em] text-emerald-400">DROP EVIDENCE HERE</p>
            <p className="mt-2 text-xs text-slate-400">
              Screenshots, messages, PDFs, transactions, URLs, documents
            </p>
            <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-600">
              or click to browse · png jpg webp pdf txt csv json doc docx · max 25 MB
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          ✕ {error}
        </p>
      )}
      {rejected.length > 0 && (
        <ul className="mt-3 space-y-1 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {rejected.map((r, i) => (
            <li key={i}>
              ⚠ Skipped {r.filename}: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
