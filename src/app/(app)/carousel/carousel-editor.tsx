"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, GripVertical, Plus, Send, CheckCircle2 } from "lucide-react";
import { saveDraft, publishDraftNow, getDraftCaptionUrl } from "../compose/actions";
import type { Platform } from "@prisma/client";
import { packMediaUrls } from "@/lib/media-urls";
import { PLATFORM_INFO, ENABLED_PLATFORMS_ORDERED } from "@/lib/platform-info";

export function CarouselEditor() {
  const router = useRouter();
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [hashtagsRaw, setHashtagsRaw] = useState("");
  const [ctaKeyword, setCtaKeyword] = useState("");
  const [ctaResponse, setCtaResponse] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(["INSTAGRAM" as Platform]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [ttQrUrl, setTtQrUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Drag reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const hashtags = hashtagsRaw
    .split(/[,\s]+/)
    .map((s) => s.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean);

  // Persist to localStorage
  const PERSIST_KEY = "carousel:state-v1";
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (Date.now() - (p.savedAt ?? 0) > 24 * 60 * 60 * 1000) return;
      if (p.images?.length) setImages(p.images);
      if (p.caption) setCaption(p.caption);
      if (p.hashtagsRaw) setHashtagsRaw(p.hashtagsRaw);
      if (p.ctaKeyword) setCtaKeyword(p.ctaKeyword);
      if (p.ctaResponse) setCtaResponse(p.ctaResponse);
      if (p.draftId) setDraftId(p.draftId);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ images, caption, hashtagsRaw, ctaKeyword, ctaResponse, draftId, savedAt: Date.now() }),
      );
    } catch {}
  }, [images, caption, hashtagsRaw, ctaKeyword, ctaResponse, draftId]);

  // Upload via presigned URL (same pattern as compose)
  async function uploadOneFile(file: File): Promise<string> {
    const SA_LIMIT = 4 * 1024 * 1024;
    if (file.size <= SA_LIMIT) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      }
      return ((await res.json()) as { url: string }).url;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const contentType = file.type || "image/jpeg";
    const presignRes = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ext, contentType }),
    });
    if (!presignRes.ok) throw new Error("Presign failed");
    const { uploadUrl, publicUrl } = (await presignRes.json()) as { uploadUrl: string; publicUrl: string };
    const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!putRes.ok) throw new Error(`R2 upload failed (${putRes.status})`);
    return publicUrl;
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setErr(null);
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of files) {
        if (images.length + newUrls.length >= 10) {
          throw new Error("Max 10 images per carousel.");
        }
        if (!file.type.startsWith("image/")) continue;
        const url = await uploadOneFile(file);
        newUrls.push(url);
      }
      setImages((cur) => [...cur, ...newUrls]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
    }
  }

  function removeImage(idx: number) {
    setImages((cur) => cur.filter((_, i) => i !== idx));
  }

  function handleReorderDrop(toIdx: number) {
    if (dragIdx === null || dragIdx === toIdx) return;
    setImages((cur) => {
      const next = [...cur];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setOverIdx(null);
  }

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const fullCaption = ctaKeyword.trim()
        ? `${caption}\n\nComment ${ctaKeyword} for the full guide`
        : caption;
      const d = await saveDraft({
        draftId: draftId ?? undefined,
        caption: fullCaption,
        hashtags,
        hookOptions: [],
        selectedHook: null,
        mediaUrl: packMediaUrls(images, {}),
        platforms,
        scheduledFor: null,
      });
      setDraftId(d.id);
      setSavedAt(new Date());
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setErr(null);
    setPublishing(true);
    try {
      let id = draftId;
      if (!id) {
        const fullCaption = ctaKeyword.trim()
          ? `${caption}\n\nComment ${ctaKeyword} for the full guide`
          : caption;
        const d = await saveDraft({
          caption: fullCaption,
          hashtags,
          hookOptions: [],
          selectedHook: null,
          mediaUrl: packMediaUrls(images, {}),
          platforms,
        });
        id = d.id;
        setDraftId(id);
      }
      await publishDraftNow(id);

      // Generate TikTok QR if TikTok is selected
      if (platforms.includes("TIKTOK" as Platform)) {
        try {
          const url = await getDraftCaptionUrl(id);
          setTtQrUrl(url);
        } catch {}
      }

      try { window.localStorage.removeItem(PERSIST_KEY); } catch {}
      if (!ttQrUrl) {
        router.push("/drafts");
        router.refresh();
      }
    } catch (e) {
      setErr(`Publish failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg p-3 flex justify-between">
          <span>{err}</span>
          <button onClick={() => setErr(null)} className="text-red-300 hover:text-red-100 text-xs font-semibold">Dismiss</button>
        </div>
      )}

      {/* Image upload drop zone */}
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setIsDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDragging(false);
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
          if (files.length === 0) { setErr("Drop image files only."); return; }
          await uploadFiles(files);
        }}
        className={`rounded-xl border-2 border-dashed p-4 transition ${
          isDragging
            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
            : "border-[var(--color-border)]"
        }`}
      >
        {isDragging && (
          <div className="mb-3 text-center text-sm font-medium text-[var(--color-accent)]">
            Drop images to add to carousel
          </div>
        )}

        {/* Image grid — draggable for reorder */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
            {images.map((url, i) => (
              <div
                key={url + i}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                onDrop={() => handleReorderDrop(i)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                className={`relative group aspect-square rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing transition ${
                  i === 0
                    ? "border-[var(--color-accent)]"
                    : overIdx === i
                    ? "border-amber-400"
                    : "border-[var(--color-border)]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Slide ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />

                {/* Slide number */}
                <span className={`absolute top-1 left-1 text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 font-bold ${
                  i === 0
                    ? "bg-[var(--color-accent)] text-[var(--color-text-on-dark)]"
                    : "bg-black/60 text-white"
                }`}>
                  {i === 0 ? "Cover" : i + 1}
                </span>

                {/* Grip + remove */}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <span className="p-1 rounded-full bg-black/60 text-white"><GripVertical className="w-3 h-3" /></span>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="p-1 rounded-full bg-black/60 text-white hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload button */}
        <div className="flex items-center gap-3">
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] text-sm font-medium">
            {uploading ? "Uploading..." : images.length === 0 ? <><Plus className="w-4 h-4" /> Add images (or drag & drop)</> : <><Plus className="w-4 h-4" /> Add more</>}
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/*"
              onChange={async (e) => {
                await uploadFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
              disabled={images.length >= 10}
            />
          </label>
          <span className="text-xs text-[var(--color-muted)]">
            {images.length}/10 slides · drag to reorder · first = cover
          </span>
        </div>
      </div>

      {/* Caption */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={6}
          placeholder="Write your carousel caption..."
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] outline-none focus:border-[var(--color-accent)] resize-y text-sm"
        />
      </div>

      {/* Hashtags */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Hashtags</label>
        <input
          value={hashtagsRaw}
          onChange={(e) => setHashtagsRaw(e.target.value)}
          placeholder="comma or space separated"
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] outline-none focus:border-[var(--color-accent)] text-sm"
        />
        {hashtags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hashtags.map((h) => (
              <span key={h} className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface)] text-[var(--color-muted)]">#{h}</span>
            ))}
          </div>
        )}
      </div>

      {/* ManyChat CTA */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
        <label className="block text-xs uppercase tracking-wider text-emerald-200 font-semibold">ManyChat CTA</label>
        <div>
          <label className="block text-[11px] font-semibold mb-1 text-emerald-200">Trigger keyword</label>
          <input
            value={ctaKeyword}
            onChange={(e) => setCtaKeyword(e.target.value.toUpperCase())}
            placeholder="e.g. GUIDE"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] outline-none focus:border-emerald-500/50 font-mono uppercase text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold mb-1 text-emerald-200">
            Bot reply{ctaKeyword.trim() ? ` when someone comments ${ctaKeyword}` : ""}
          </label>
          <textarea
            value={ctaResponse}
            onChange={(e) => setCtaResponse(e.target.value)}
            rows={3}
            placeholder={ctaKeyword.trim()
              ? `You said ${ctaKeyword}! Here it is 🤩\nTap the button below to grab the full guide.`
              : "Set the keyword first."}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] outline-none focus:border-emerald-500/50 resize-y text-sm"
          />
          {ctaKeyword.trim() && !ctaResponse.trim() && (
            <button
              type="button"
              onClick={() => setCtaResponse(`You said ${ctaKeyword}! Here it is 🤩\n\nI put together a full guide for you — tap the button below to grab it.\n\nLet me know if you have questions!`)}
              className="mt-1 text-[11px] text-emerald-300 hover:underline"
            >
              Generate template →
            </button>
          )}
        </div>
      </div>

      {/* Platforms */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Platforms</label>
        <div className="flex flex-wrap gap-2">
          {ENABLED_PLATFORMS_ORDERED.map((p) => {
            const info = PLATFORM_INFO[p];
            if (!info.publishSupported) return null;
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])}
                style={on ? { backgroundColor: info.brandColor, color: "white", borderColor: info.brandColor } : undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                  on ? "font-medium border-transparent" : "bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] hover:border-[var(--color-muted)]"
                }`}
              >
                <info.icon className="w-3.5 h-3.5" />
                {info.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TikTok QR code (shown after publish) */}
      {ttQrUrl && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="text-sm text-amber-300 font-semibold">
            ✓ Published — scan QR on your phone to paste the TikTok caption
          </div>
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-lg bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(ttQrUrl)}`}
                alt="Scan to copy caption" width={120} height={120}
              />
            </div>
            <div className="space-y-1 text-[11px] text-[var(--color-muted)]">
              <p><strong className="text-[var(--color-text)]">On your phone:</strong></p>
              <p>1. Scan this QR code</p>
              <p>2. Tap &quot;Copy Caption&quot;</p>
              <p>3. Open TikTok → paste</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { router.push("/drafts"); router.refresh(); }}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
          >
            Go to drafts →
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--color-border)]">
        <button
          onClick={save}
          disabled={saving || images.length === 0}
          className="px-4 py-2 rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save draft"}
        </button>
        <button
          onClick={publish}
          disabled={publishing || images.length === 0 || platforms.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium text-sm disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {publishing ? "Publishing..." : `Publish to ${platforms.length} platform${platforms.length === 1 ? "" : "s"}`}
        </button>
        {savedAt && (
          <span className="text-xs text-[var(--color-muted)] flex items-center gap-1 ml-auto">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> saved
          </span>
        )}
      </div>
    </div>
  );
}
