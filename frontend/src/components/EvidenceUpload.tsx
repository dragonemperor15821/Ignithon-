import { useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, uploadEvidence, type RejectedFile } from "../api";
import { AlertCircleIcon, CrossIcon, UploadCloudIcon } from "./Icons";

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
    <div className="w-full">
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
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-all duration-200 ${
          dragging
            ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]"
            : "border-slate-800 bg-slate-950/50 hover:border-emerald-500/50 hover:bg-slate-900/50"
        } ${uploading ? "pointer-events-none opacity-80" : ""}`}
      >
        {uploading ? (
          <div className="flex flex-col items-center">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            </div>
            <p className="mt-3 text-sm font-semibold tracking-wide text-emerald-400">
              HASHING (SHA-256) &amp; REGISTERING EVIDENCE…
            </p>
            <p className="mt-1 text-xs text-slate-400">Computing cryptographic checksums and creating immutable records</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover:scale-105 group-hover:bg-emerald-500/20 transition duration-200">
              <UploadCloudIcon className="h-6 w-6 stroke-[1.75]" />
            </div>
            <p className="mt-3 text-sm font-bold tracking-wider text-slate-200 uppercase">
              DRAG &amp; DROP EVIDENCE FILES HERE
            </p>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              Upload multiple screenshots, PDF incident reports, transaction logs, plain text transcripts, or CSV datasets.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">PNG / JPG / WEBP</span>
              <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">PDF</span>
              <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">TXT</span>
              <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">CSV / JSON</span>
              <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5">DOC / DOCX</span>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">MAX 25MB</span>
            </div>
          </div>
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
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
          <CrossIcon className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          <div className="flex items-center gap-1.5 font-semibold text-amber-200">
            <AlertCircleIcon className="h-4 w-4 text-amber-400" />
            <span>Files Skipped ({rejected.length}):</span>
          </div>
          <ul className="mt-1 space-y-1 pl-5 list-disc text-amber-300/90 text-[11px] font-mono">
            {rejected.map((r, i) => (
              <li key={i}>
                <span className="font-semibold text-white">{r.filename}</span>: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

