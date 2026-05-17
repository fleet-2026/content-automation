"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Upload,
  X,
  CalendarClock,
  Save,
  CheckCircle2,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { Platform } from "@prisma/client";
import { saveDraft, publishDraftNow, scheduleDraft } from "@/app/(app)/compose/actions";
import { packMediaUrls, isImageUrl } from "@/lib/media-urls";

/**
 * Compact dashboard-resident composer. Lets the user write a caption, attach
 * up to 4 images, pick platforms, and either publish immediately, schedule,
 * or save as a draft — without leaving the dashboard.
 *
 * For the heavy stuff (hook A/B simulator, post-fixer / Viralize, the canvas
 * "Add text on image" editor, fully-paged 10-slot carousel) we surface a
 * link to the full composer. Keeping the inline card lightweight prevents
 * the dashboard from turning into a full second composer.
 */
const ALL_PLATFORMS: Platform[] = ["INSTAGRAM", "YOUTUBE", "TIKTOK"];
const QUICK_MAX_IMAGES = 4; // dashboard card cap — push to /compose for full 10

export function QuickPostCard({
  connectedPlatforms,
}: {
  connectedPlatforms: Platform[];
}) {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>(connectedPlatforms);
  const [scheduledFor, setScheduledFor] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingDraft, startSave] = useTransition();
  const [publishing, startPub] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  // Parse hashtags out of the caption the way the full composer does, so
  // the saved draft gets a clean `hashtags` array instead of #tags only
  // living in the caption text.
  const hashtags = Array.from(
    caption.matchAll(/#([a-zA-Z0-9_]+)/g),
  ).map((m) => m[1].toLowerCase());

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setErr(null);
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of files) {
        if (mediaUrls.length + newUrls.length >= QUICK_MAX_IMAGES) {
          throw new Error(
            `Quick post card caps at ${QUICK_MAX_IMAGES} images — use the full composer for larger carousels.`,
          );
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
        }
        const { url } = (await res.json()) as { url: string };
        newUrls.push(url);
      }
      setMediaUrls((cur) => [...cur, ...newUrls]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeMedia(idx: number) {
    setMediaUrls((cur) => cur.filter((_, i) => i !== idx));
  }

  function togglePlatform(p: Platform) {
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  function reset() {
    setCaption("");
    setMediaUrls([]);
    setScheduledFor("");
    setSavedDraftId(null);
    setPublished(false);
    setErr(null);
  }

  function saveDraftOnly() {
    if (!caption.trim()) {
      setErr("Add a caption first.");
      return;
    }
    setErr(null);
    startSave(async () => {
      try {
        const d = await saveDraft({
          caption,
          hashtags,
          hookOptions: [],
          selectedHook: null,
          mediaUrl: packMediaUrls(mediaUrls),
          platforms,
          scheduledFor: scheduledFor || null,
        });
        setSavedDraftId(d.id);
      } catch (e) {
        setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function publish() {
    if (!caption.trim()) {
      setErr("Add a caption first.");
      return;
    }
    if (platforms.length === 0) {
      setErr("Pick at least one platform.");
      return;
    }
    if (
      !confirm(
        `Publish to ${platforms.join(", ")} now? This posts to your live accounts.`,
      )
    )
      return;
    setErr(null);
    startPub(async () => {
      try {
        const d = await saveDraft({
          caption,
          hashtags,
          hookOptions: [],
          selectedHook: null,
          mediaUrl: packMediaUrls(mediaUrls),
          platforms,
        });
        await publishDraftNow(d.id);
        setPublished(true);
        router.refresh();
      } catch (e) {
        setErr(`Publish failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function schedule() {
    if (!caption.trim()) {
      setErr("Add a caption first.");
      return;
    }
    if (!scheduledFor) {
      setErr("Pick a date and time to schedule.");
      return;
    }
    if (platforms.length === 0) {
      setErr("Pick at least one platform.");
      return;
    }
    setErr(null);
    startPub(async () => {
      try {
        const d = await saveDraft({
          caption,
          hashtags,
          hookOptions: [],
          selectedHook: null,
          mediaUrl: packMediaUrls(mediaUrls),
          platforms,
          scheduledFor,
        });
        await scheduleDraft(d.id, scheduledFor);
        setSavedDraftId(d.id);
        router.refresh();
      } catch (e) {
        setErr(`Schedule failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  // Success state replaces the form so the user gets clean confirmation
  // and an obvious "post another" reset path instead of stale state.
  if (published) {
    return (
      <div className="border rounded-xl bg-[var(--color-surface)] p-5 text-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-700 mx-auto mb-2" />
        <p className="font-medium">Published to {platforms.join(", ")}.</p>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Posts will appear in your feed shortly. Check /drafts for delivery
          status if anything failed.
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={reset}
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium"
          >
            Post another
          </button>
          <Link
            href="/drafts"
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium"
          >
            View drafts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--color-accent)]" />
          Quick post
        </h2>
        <Link
          href="/compose"
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:underline"
        >
          Open full composer →
        </Link>
      </div>

      {/* Caption */}
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        placeholder="What's the post? Type or paste a caption. #hashtags are picked up automatically."
        className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] text-sm resize-y min-h-[80px]"
      />

      {/* Media row — upload button + thumbnail chips */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <label className="cursor-pointer flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium">
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          {uploading
            ? "Uploading…"
            : mediaUrls.length === 0
              ? "Add image"
              : "Add more"}
          <input
            type="file"
            hidden
            multiple
            accept="image/*,video/*"
            onChange={handleUpload}
            disabled={mediaUrls.length >= QUICK_MAX_IMAGES}
          />
        </label>
        {mediaUrls.map((u, i) => (
          <div
            key={`${u}-${i}`}
            className="relative w-12 h-12 rounded-md overflow-hidden bg-[var(--color-surface-2)] group"
          >
            {isImageUrl(u) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full grid place-items-center text-[9px] uppercase tracking-wider text-[var(--color-muted)]">
                video
              </div>
            )}
            <button
              onClick={() => removeMedia(i)}
              className="absolute top-0 right-0 p-0.5 rounded-bl bg-black/60 text-white opacity-0 group-hover:opacity-100"
              aria-label="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {mediaUrls.length > 0 && (
          <span className="text-[11px] text-[var(--color-muted)]">
            {mediaUrls.length}/{QUICK_MAX_IMAGES}
          </span>
        )}
      </div>

      {/* Platform toggles */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] mr-1">
          Post to
        </span>
        {ALL_PLATFORMS.map((p) => {
          const enabled = connectedPlatforms.includes(p);
          const on = platforms.includes(p);
          return (
            <button
              key={p}
              type="button"
              disabled={!enabled}
              onClick={() => togglePlatform(p)}
              title={enabled ? "" : "Connect this platform from the Connect section below"}
              className={
                "px-2.5 py-1 rounded-full text-xs " +
                (!enabled
                  ? "bg-[var(--color-surface-2)] text-[var(--color-muted)] line-through cursor-not-allowed"
                  : on
                    ? "bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]")
              }
            >
              {p.toLowerCase()}
            </button>
          );
        })}
      </div>

      {/* Schedule + actions */}
      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-md bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
          title="Optional: schedule for later"
        />
        {scheduledFor ? (
          <button
            onClick={schedule}
            disabled={publishing || !caption.trim() || platforms.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium disabled:opacity-50"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            {publishing ? "Scheduling…" : "Schedule"}
          </button>
        ) : (
          <button
            onClick={publish}
            disabled={publishing || !caption.trim() || platforms.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {publishing ? "Publishing…" : "Publish now"}
          </button>
        )}
        <button
          onClick={saveDraftOnly}
          disabled={savingDraft || !caption.trim()}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {savingDraft ? "Saving…" : savedDraftId ? "Saved" : "Save draft"}
        </button>
        {savedDraftId && !err && (
          <Link
            href={`/compose?draft=${savedDraftId}`}
            className="text-[11px] text-[var(--color-accent)] hover:underline ml-auto"
          >
            Open in full composer →
          </Link>
        )}
      </div>

      {err && (
        <div className="mt-3 bg-red-100 border border-red-300 text-red-900 text-xs rounded-md p-2.5">
          {err}
        </div>
      )}
    </div>
  );
}
