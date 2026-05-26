"use client";

import { useRef, useState, useTransition } from "react";
import { patchTrackerRow, publishRow, uploadRowImage } from "./actions";
import type { TrackerMeta } from "./meta";

type Props = {
  draftId: string;
  caption: string | null;
  hook: string | null;
  mediaUrl: string | null;
  platforms: string[];
  status: string;
  meta: TrackerMeta;
};

export default function TrackerRow({
  draftId,
  caption,
  hook,
  mediaUrl,
  platforms,
  status,
  meta,
}: Props) {
  const [igUrl, setIgUrl] = useState(meta.igPostUrl ?? "");
  const [keyword, setKeyword] = useState(meta.keyword ?? "");
  const [wired, setWired] = useState(meta.manychatWired ?? false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"cap" | "dm" | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState(mediaUrl);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const badgeColor = wired
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : meta.igPostUrl
      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";

  const flush = (patch: Parameters<typeof patchTrackerRow>[1]) => {
    setError(null);
    startTransition(async () => {
      const res = await patchTrackerRow(draftId, patch);
      if (!res.ok) setError(res.error ?? "save failed");
    });
  };

  const copy = async (text: string | null | undefined, which: "cap" | "dm") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  };

  const handlePublish = () => {
    setPublishStatus(null);
    setError(null);
    if (!confirm(`Publish Day ${meta.dayNumber ?? "?"} to ${platforms.join(", ")} now?`)) return;
    startTransition(async () => {
      const res = await publishRow(draftId);
      if (!res.ok) {
        setError(res.error ?? "publish failed");
        return;
      }
      const results = res.results ?? [];
      const ok = results.filter((r) => r.ok);
      const fail = results.filter((r) => !r.ok);
      setPublishStatus(
        `✓ ${ok.length}/${results.length} platforms` +
          (fail.length ? ` · failed: ${fail.map((f) => f.platform).join(",")}` : ""),
      );
    });
  };

  return (
    <>
      <tr
        className={`border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]/40 transition-colors ${isPending ? "opacity-60" : ""}`}
      >
        {/* Day badge */}
        <td className="px-3 py-3 align-top">
          <span
            className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border text-sm font-semibold ${badgeColor}`}
          >
            {meta.dayNumber ?? "?"}
          </span>
        </td>

        {/* Title / caption / keyword */}
        <td className="px-3 py-3 align-top">
          {hook && (
            <div className="text-sm font-medium text-[var(--color-text)] leading-tight mb-1 line-clamp-2">
              {hook}
            </div>
          )}
          {caption && (
            <div className="text-xs text-[var(--color-muted)] line-clamp-2 max-w-md mb-2">
              {caption}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value.toUpperCase())}
              onBlur={() => {
                if (keyword !== (meta.keyword ?? "")) flush({ keyword });
              }}
              placeholder="KEYWORD"
              className="font-mono text-xs uppercase px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-amber-500 focus:outline-none w-32"
            />
            <button
              onClick={() => copy(caption, "cap")}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline-offset-2 hover:underline transition-colors"
              title="Copy caption to clipboard"
            >
              {copied === "cap" ? "✓ copied" : "copy caption"}
            </button>
            <button
              onClick={() => copy(meta.manychatDmText, "dm")}
              className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline-offset-2 hover:underline transition-colors"
              title="Copy DM text to clipboard"
            >
              {copied === "dm" ? "✓ copied" : "copy DM"}
            </button>
          </div>
        </td>

        {/* Guide link */}
        <td className="px-3 py-3 align-top">
          {meta.guideLink ? (
            <a
              href={meta.guideLink}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-amber-400 hover:underline whitespace-nowrap"
            >
              #day-{meta.dayNumber} ↗
            </a>
          ) : (
            <span className="text-xs text-zinc-500">—</span>
          )}
        </td>

        {/* IG post URL */}
        <td className="px-3 py-3 align-top">
          <input
            type="url"
            value={igUrl}
            onChange={(e) => setIgUrl(e.target.value)}
            onBlur={() => {
              if (igUrl !== (meta.igPostUrl ?? "")) flush({ igPostUrl: igUrl });
            }}
            placeholder="paste IG post URL"
            className="text-xs px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] focus:border-amber-500 focus:outline-none w-52"
          />
        </td>

        {/* Wired checkbox */}
        <td className="px-3 py-3 align-top text-center">
          <input
            type="checkbox"
            checked={wired}
            onChange={(e) => {
              const next = e.target.checked;
              setWired(next);
              flush({ manychatWired: next });
            }}
            className="w-5 h-5 cursor-pointer accent-emerald-500"
          />
        </td>

        {/* Publish button */}
        <td className="px-3 py-3 align-top">
          <button
            onClick={handlePublish}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md bg-amber-500 text-zinc-900 text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {isPending ? "…" : "Post all →"}
          </button>
          {publishStatus && (
            <div className="mt-1 text-[10px] text-[var(--color-muted)]">
              {publishStatus}
            </div>
          )}
        </td>

        {/* Image — click to upload */}
        <td className="px-3 py-3 align-top">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setError(null);
              const fd = new FormData();
              fd.append("file", file);
              uploadRowImage(draftId, fd).then((res) => {
                setUploading(false);
                if (res.ok) {
                  setImgUrl(res.url);
                } else {
                  setError(res.error);
                }
              });
              // Reset so re-selecting the same file triggers onChange
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="group relative w-12 h-12 rounded-lg overflow-hidden border border-[var(--color-border)] hover:border-amber-500 transition-colors cursor-pointer disabled:opacity-50"
            title="Click to upload image"
          >
            {imgUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imgUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[var(--color-surface)]">
                <svg className="w-5 h-5 text-zinc-500 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {imgUrl && !uploading && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </div>
            )}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="px-4 py-1 text-xs text-rose-400 bg-rose-500/5">
            ⚠ {error}
          </td>
        </tr>
      )}
    </>
  );
}
