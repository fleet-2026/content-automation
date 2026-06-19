"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, Send, CalendarClock, CheckCircle2, Type, X, Plus, Music2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { generateHookVariants, saveDraft, publishDraftNow, scheduleDraft, rateComposeContent } from "./actions";
import type { Platform } from "@prisma/client";
import { HookOverlayEditor } from "./hook-overlay-editor";
import { PostPreview } from "./post-preview";
import { parseMediaUrls, parseMusicUrl, packMediaUrls, isImageUrl, isVideoUrl } from "@/lib/media-urls";
import { PLATFORM_INFO, ENABLED_PLATFORMS_ORDERED } from "@/lib/platform-info";
import { TikTokCaptionQr } from "@/components/tiktok-caption-qr";

type Hook = {
  text: string;
  pattern: string | null;
  predictedER: number | null;
  similarHookIds: string[];
  reasoning?: string;
};

/** Mirrors ContentRating from @/lib/ai/rate-content. Defined locally so the
 *  client bundle doesn't import the server-only rating module. */
type ContentRating = {
  scriptScore: number;
  captionScore: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  captionRewrites: string[];
};

export type InitialDraft = {
  id: string;
  caption: string;
  hashtags: string[];
  hookOptions: Hook[];
  selectedHook: string | null;
  mediaUrl: string | null;
  platforms: Platform[];
  scheduledFor: string; // "YYYY-MM-DDTHH:MM" or empty
};

// localStorage key for the cross-navigation autosave snapshot. Module-scoped
// so it's a stable reference (not recreated per render) for the autosave effect.
const PERSIST_KEY = "compose:state-v1";

export function Composer({
  connectedPlatforms,
  initialDraft,
  initialCaptionPrefill,
  initialMediaUrl,
  freshStart,
}: {
  connectedPlatforms: Platform[];
  initialDraft?: InitialDraft;
  initialCaptionPrefill?: string | null;
  /** Pre-attach a media URL when starting a fresh draft (e.g. from
   * /compose?mediaUrl=… on the Drafts page "Use in new draft" link). Only
   * applied when no initialDraft is provided so we don't clobber an existing
   * draft's media. */
  initialMediaUrl?: string | null;
  /** "?new=1" — user clicked "New post". Start blank and drop any autosaved
   * snapshot so they don't reopen the draft they just made. */
  freshStart?: boolean;
}) {
  const router = useRouter();
  // If we're hydrating from a draft, strip the selected hook off the front
  // of the caption so the editor shows just the body. The selected hook
  // is shown separately in the hook picker.
  function captionWithoutHook(c: string, hook: string | null): string {
    if (!hook) return c;
    const stripped = c.startsWith(hook) ? c.slice(hook.length).replace(/^\s+/, "") : c;
    return stripped;
  }

  // ─── Cross-navigation persistence ─────────────────────────────
  // Save the working draft to localStorage on every change so the user
  // can leave /compose to grab info elsewhere and come back without
  // losing what they typed. Loaded once on mount via the lazy state
  // initializers below; cleared after a successful publish. Drops
  // anything older than 24h so a forgotten browser doesn't surface a
  // week-old half-draft. (PERSIST_KEY is module-scoped above.)
  type PersistedState = Partial<{
    topic: string;
    caption: string;
    hashtagsRaw: string;
    hooks: Hook[];
    selectedHook: string | null;
    mediaUrls: string[];
    musicUrl: string | null;
    platforms: Platform[];
    scheduledFor: string;
    ctaKeyword: string;
    ctaResponse: string;
    guideFileUrl: string | null;
    savedAt: number;
  }>;
  // Cross-navigation restore: a free-form NEW post snapshot is restored when
  // you leave /compose and come back, so in-progress work isn't lost. Guarded
  // so the old "previous post silently resurfaces" problem can't happen:
  //   • editing a specific draft (?draft=<id>) → DB is the source of truth
  //   • "New post" (?new=1, freshStart)        → start blank, wipe snapshot
  // Otherwise we restore the snapshot (if < 24h old) and show a dismissible
  // banner so the user always knows why fields are pre-filled.
  const useLocalSnapshot = !initialDraft && !freshStart;
  const [persisted] = useState<PersistedState>(() => {
    if (typeof window === "undefined") return {};
    try {
      if (!useLocalSnapshot) {
        window.localStorage.removeItem(PERSIST_KEY);
        return {};
      }
      const raw = window.localStorage.getItem(PERSIST_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as PersistedState;
      // Expire stale snapshots so a long-forgotten tab can't resurface a
      // week-old half-draft.
      if (!parsed.savedAt || Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
        window.localStorage.removeItem(PERSIST_KEY);
        return {};
      }
      return parsed;
    } catch {
      return {};
    }
  });
  // Did we actually rehydrate meaningful work? Drives the restore banner.
  const restoredInitially =
    useLocalSnapshot &&
    (!!persisted.caption?.trim() ||
      (persisted.mediaUrls?.length ?? 0) > 0 ||
      !!persisted.topic?.trim());

  const [topic, setTopic] = useState(persisted.topic ?? "");
  const [caption, setCaption] = useState(() => {
    if (persisted.caption !== undefined) return persisted.caption;
    if (initialDraft) return captionWithoutHook(initialDraft.caption, initialDraft.selectedHook);
    if (initialCaptionPrefill) return initialCaptionPrefill;
    return "";
  });
  const [hashtagsRaw, setHashtagsRaw] = useState(() => {
    if (persisted.hashtagsRaw !== undefined) return persisted.hashtagsRaw;
    return initialDraft ? initialDraft.hashtags.map((h) => `#${h}`).join(" ") : "";
  });
  const [hooks, setHooks] = useState<Hook[]>(() => {
    if (Array.isArray(persisted.hooks)) return persisted.hooks;
    if (Array.isArray(initialDraft?.hookOptions)) return initialDraft.hookOptions;
    return [];
  });
  const [selectedHook, setSelectedHook] = useState<string | null>(
    persisted.selectedHook !== undefined ? persisted.selectedHook : initialDraft?.selectedHook ?? null,
  );
  // Multi-image state. Backed by a packed string on the Draft.mediaUrl field
  // (newline-separated URLs) until a proper schema migration lands. The first
  // entry is the "primary" — used for the hook-on-image overlay, the cards,
  // and single-platform publishing fallback (TikTok/YouTube can only post
  // one media; Instagram supports up to 10 in a carousel).
  const [mediaUrls, setMediaUrls] = useState<string[]>(() => {
    if (Array.isArray(persisted.mediaUrls) && persisted.mediaUrls.length) return persisted.mediaUrls;
    if (initialDraft) return parseMediaUrls(initialDraft.mediaUrl);
    if (initialMediaUrl) return [initialMediaUrl];
    return [];
  });
  const primaryMediaUrl = mediaUrls[0] ?? null;

  // Background music URL packed into the same Draft.mediaUrl field via the
  // `audio::` prefix. See src/lib/media-urls.ts. We display it separately
  // from visual media in the UI, but it travels with the draft.
  const [musicUrl, setMusicUrl] = useState<string | null>(() => {
    if (persisted.musicUrl !== undefined) return persisted.musicUrl;
    if (initialDraft) return parseMusicUrl(initialDraft.mediaUrl);
    return null;
  });
  const [musicUploading, setMusicUploading] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(
    persisted.platforms ?? (initialDraft?.platforms.length ? initialDraft.platforms : connectedPlatforms),
  );
  const [scheduledFor, setScheduledFor] = useState<string>(
    persisted.scheduledFor ?? initialDraft?.scheduledFor ?? "",
  );
  const [ctaKeyword, setCtaKeyword] = useState(persisted.ctaKeyword ?? "");
  const [ctaResponse, setCtaResponse] = useState(persisted.ctaResponse ?? "");
  const [guideFileUrl, setGuideFileUrl] = useState<string | null>(persisted.guideFileUrl ?? null);
  const [guideFileUploading, setGuideFileUploading] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  // After a TikTok publish we stay on the page and show the caption QR
  // (TikTok delivers to the inbox without a caption — the user pastes it
  // from their phone). Holds the just-published draft id.
  const [ttPublishedId, setTtPublishedId] = useState<string | null>(null);

  // "Save draft" persists to the DB (reachable from /drafts → Edit). Separately,
  // an effect below autosaves the working state to localStorage so navigating
  // away and back doesn't lose anything — see useLocalSnapshot above.
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showRestoredBanner, setShowRestoredBanner] = useState(restoredInitially);
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Schedule popover state. Replaces the dynamic Publish/Schedule label
  // pattern that confused users — clicking "Schedule or publish" now
  // opens a small popover with both options clearly listed so the user
  // chooses post-now vs. scheduled time without guessing what the button
  // will do.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click / Esc.
  useEffect(() => {
    if (!scheduleOpen) return;
    function onDown(e: MouseEvent) {
      if (!scheduleRef.current) return;
      if (!scheduleRef.current.contains(e.target as Node)) {
        setScheduleOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setScheduleOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [scheduleOpen]);

  // ─── Cross-navigation autosave ───────────────────────────────
  // Mirror the working draft into localStorage on every change so leaving
  // /compose (to grab a link, check Trends, etc.) and coming back restores
  // it. Free-form new posts only — editing a saved draft relies on the DB.
  // Cleared on publish/schedule and on Discard.
  useEffect(() => {
    if (!useLocalSnapshot) return;
    const hasContent =
      caption.trim() || mediaUrls.length > 0 || topic.trim() || hashtagsRaw.trim();
    try {
      if (hasContent) {
        const snapshot: PersistedState = {
          topic,
          caption,
          hashtagsRaw,
          hooks,
          selectedHook,
          mediaUrls,
          musicUrl,
          platforms,
          scheduledFor,
          ctaKeyword,
          ctaResponse,
          guideFileUrl,
          savedAt: Date.now(),
        };
        window.localStorage.setItem(PERSIST_KEY, JSON.stringify(snapshot));
      }
    } catch {
      /* localStorage full / disabled — autosave is best-effort */
    }
  }, [
    useLocalSnapshot,
    topic,
    caption,
    hashtagsRaw,
    hooks,
    selectedHook,
    mediaUrls,
    musicUrl,
    platforms,
    scheduledFor,
    ctaKeyword,
    ctaResponse,
    guideFileUrl,
  ]);

  /** Discard the restored snapshot and reset the editor to blank. */
  function discardRestored() {
    setTopic("");
    setCaption("");
    setHashtagsRaw("");
    setHooks([]);
    setSelectedHook(null);
    setMediaUrls([]);
    setMusicUrl(null);
    setCtaKeyword("");
    setCtaResponse("");
    setGuideFileUrl(null);
    setScheduledFor("");
    setDraftId(null);
    setShowRestoredBanner(false);
    try {
      window.localStorage.removeItem(PERSIST_KEY);
    } catch {}
  }

  const [generating, startGen] = useTransition();
  const [saving, startSave] = useTransition();
  const [publishing, startPub] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Script/caption AI rating (same scorer as the daily-post editor, but on the
  // raw text typed here — no save required).
  const [rating, startRate] = useTransition();
  const [contentRating, setContentRating] = useState<ContentRating | null>(null);
  const [rateErr, setRateErr] = useState<string | null>(null);

  const hashtags = hashtagsRaw
    .split(/[,\s]+/)
    .map((s) => s.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean);

  function runRate() {
    setRateErr(null);
    setContentRating(null);
    startRate(async () => {
      const res = await rateComposeContent({ topic, hook: selectedHook, caption, hashtags });
      if (res.ok && res.rating) setContentRating(res.rating as ContentRating);
      else setRateErr(res.error ?? "Rating failed");
    });
  }

  function generate() {
    if (!topic.trim()) return;
    setErr(null);
    startGen(async () => {
      try {
        const v = await generateHookVariants({ topic, caption, count: 6 });
        if (!v || v.length === 0) {
          setErr("Hook generator returned 0 variants. Check ANTHROPIC_API_KEY and try a different topic.");
          return;
        }
        setHooks(v as Hook[]);
        if (v[0]) setSelectedHook(v[0].text);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  /** Upload a single file to R2.
   *  Videos + large files: always presigned PUT direct to R2 (bypasses
   *  Vercel's 4.5 MB serverless body limit entirely).
   *  Small images (≤ 4 MB): POST to /api/upload. */
  const SA_LIMIT = 4 * 1024 * 1024;
  const MAX_UPLOAD = 200 * 1024 * 1024;

  async function uploadViaPresign(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const contentType = file.type || "application/octet-stream";
    const presignRes = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ext, contentType }),
    });
    if (!presignRes.ok) {
      const j = (await presignRes.json().catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(j.message ?? j.error ?? `Presign failed (${presignRes.status})`);
    }
    const { uploadUrl, publicUrl } = (await presignRes.json()) as {
      uploadUrl: string;
      publicUrl: string;
    };
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!putRes.ok) {
      const text = await putRes.text().catch(() => "");
      if (text.includes("Failed to fetch") || text.includes("NetworkError")) {
        throw new Error(
          "Upload blocked — R2 CORS not configured. Go to Cloudflare Dashboard > " +
          "R2 > bucket > Settings > CORS Policy and allow your domain.",
        );
      }
      throw new Error(`R2 upload failed (${putRes.status})`);
    }
    return publicUrl;
  }

  async function uploadOneFile(file: File): Promise<string> {
    if (file.size > MAX_UPLOAD) {
      throw new Error(`File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — max is 200 MB.`);
    }
    // Videos always go through presigned (Vercel caps body at 4.5 MB).
    // Large images too. Only small images use the server-side proxy.
    const isVideo = file.type.startsWith("video/");
    if (isVideo || file.size > SA_LIMIT) {
      return uploadViaPresign(file);
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
    }
    const { url } = (await res.json()) as { url: string };
    return url;
  }

  /** Core upload routine — accepts a raw File[] so it can be called from
   *  either the <input type=file> change event OR the drop zone's
   *  drop event. Sequential uploads; Instagram carousel cap = 10. */
  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setErr(null);
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of files) {
        if (mediaUrls.length + newUrls.length >= 10) {
          throw new Error("Max 10 images per post (Instagram carousel limit).");
        }
        const url = await uploadOneFile(file);
        newUrls.push(url);
      }
      setMediaUrls((cur) => [...cur, ...newUrls]);
      // Auto-save so uploaded videos aren't lost if the user navigates away.
      try {
        const allMedia = [...mediaUrls, ...newUrls];
        const d = await saveDraft({
          draftId: draftId ?? undefined,
          caption: selectedHook ? `${selectedHook}\n\n${caption}` : caption,
          hashtags,
          hookOptions: hooks,
          selectedHook,
          mediaUrl: packMediaUrls(allMedia, { musicUrl }),
          platforms,
          scheduledFor: scheduledFor || null,
        });
        setDraftId(d.id);
        setSavedAt(new Date());
      } catch { /* auto-save is best-effort */ }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    await uploadFiles(files);
    // reset input so picking the same file again still triggers onChange
    e.target.value = "";
  }

  // ─── Drag-and-drop image upload ──────────────────────────────
  // The media slot below is wrapped in a div that listens for dragover
  // / dragleave / drop. We only accept image+video files; if the user
  // drops e.g. a folder or unsupported type, the API call surfaces the
  // error inline (same path as the file picker).
  const [isDragging, setIsDragging] = useState(false);
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear when leaving the wrapper, not when entering a child.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
      /^(image|video)\//.test(f.type),
    );
    if (files.length === 0) {
      setErr("Drop image or video files only.");
      return;
    }
    await uploadFiles(files);
  }

  function removeMedia(idx: number) {
    setMediaUrls((cur) => cur.filter((_, i) => i !== idx));
  }

  /**
   * Upload a background-music file (mp3, m4a, wav, ogg) to R2 via the
   * existing /api/upload endpoint. The endpoint sniffs file type from
   * magic bytes — audio files are accepted as long as they're in the
   * allowed-mime list in lib/file-sniff.ts.
   */
  async function handleMusicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setMusicUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      setMusicUrl(url);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setMusicUploading(false);
      e.target.value = "";
    }
  }

  function removeMusic() {
    setMusicUrl(null);
  }

  function moveMediaToPrimary(idx: number) {
    setMediaUrls((cur) => {
      if (idx === 0 || idx >= cur.length) return cur;
      const next = [...cur];
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  }

  function save() {
    setErr(null);
    startSave(async () => {
      try {
        const d = await saveDraft({
          draftId: draftId ?? undefined,
          caption: selectedHook ? `${selectedHook}\n\n${caption}` : caption,
          hashtags,
          hookOptions: hooks,
          selectedHook,
          mediaUrl: packMediaUrls(mediaUrls, { musicUrl }),
          platforms,
          scheduledFor: scheduledFor || null,
        });
        setDraftId(d.id);
        setSavedAt(new Date());
      } catch (e) {
        setErr(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function publish() {
    setErr(null);
    startPub(async () => {
      try {
        // ALWAYS persist the on-screen state first, passing the existing
        // draftId so this UPDATES the row instead of creating a duplicate.
        // Before, we only saved when draftId was null — so a draft that was
        // auto-created during media upload (caption still empty at that
        // moment) would publish stale/empty text, and the TikTok caption QR
        // (which re-reads the draft from the DB) came back blank. Re-saving
        // here keeps the DB row in lockstep with the editor.
        const d = await saveDraft({
          draftId: draftId ?? undefined,
          caption: selectedHook ? `${selectedHook}\n\n${caption}` : caption,
          hashtags,
          hookOptions: hooks,
          selectedHook,
          mediaUrl: packMediaUrls(mediaUrls, { musicUrl }),
          platforms,
        });
        const id = d.id;
        setDraftId(id);
        await publishDraftNow(id);
        // Clear the persisted draft now that it's gone live so the
        // next visit to /compose starts blank.
        try {
          window.localStorage.removeItem(PERSIST_KEY);
        } catch {}
        // If TikTok was a target, stay here and surface the caption QR so
        // the user can paste it on their phone. Otherwise jump straight to
        // the unified Published page. Either way the post is now filed there.
        if (platforms.includes("TIKTOK" as Platform)) {
          setTtPublishedId(id);
          router.refresh();
        } else {
          router.push("/published");
          router.refresh();
        }
      } catch (e) {
        setErr(`Publish failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function schedule() {
    if (!scheduledFor) return;
    setErr(null);
    startPub(async () => {
      try {
        // Persist the on-screen state (update, not create) so the scheduled
        // post fires with the caption/media actually shown — not a stale
        // auto-saved version. saveDraft sets status=SCHEDULED + scheduledFor;
        // scheduleDraft then dispatches the timed Inngest publish.
        const d = await saveDraft({
          draftId: draftId ?? undefined,
          caption: selectedHook ? `${selectedHook}\n\n${caption}` : caption,
          hashtags,
          hookOptions: hooks,
          selectedHook,
          mediaUrl: packMediaUrls(mediaUrls, { musicUrl }),
          platforms,
          scheduledFor,
        });
        setDraftId(d.id);
        await scheduleDraft(d.id, scheduledFor);
        // The working draft is committed to the schedule — drop the snapshot.
        try {
          window.localStorage.removeItem(PERSIST_KEY);
        } catch {}
        router.push("/drafts");
        router.refresh();
      } catch (e) {
        setErr(`Schedule failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      {/* Left: editor */}
      <div className="space-y-4">
        {showRestoredBanner && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-3 py-2">
            <span className="leading-relaxed">
              Restored your unsaved draft from your last session. Keep editing —
              or discard to start fresh.
            </span>
            <button
              type="button"
              onClick={discardRestored}
              className="text-xs font-semibold underline hover:opacity-80 shrink-0"
            >
              Discard
            </button>
          </div>
        )}
        {err && (
          <div className="bg-red-100 border border-red-300 text-red-900 text-sm rounded-lg p-3 flex justify-between items-start gap-3">
            <span className="leading-relaxed">{err}</span>
            <button
              onClick={() => setErr(null)}
              className="text-red-900/70 hover:text-red-900 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}
        {ttPublishedId && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-emerald-700">
                ✓ Published — filed to your Published page.
              </span>
              <Link href="/published" className="text-xs underline font-semibold text-emerald-700 hover:opacity-80">
                View Published →
              </Link>
            </div>
            <TikTokCaptionQr
              draftId={ttPublishedId}
              caption={
                (selectedHook ? `${selectedHook}\n\n` : "") +
                caption +
                (hashtagsRaw.trim() ? `\n\n${hashtagsRaw.trim()}` : "")
              }
              autoOpen
            />
          </div>
        )}
        <Field label="Topic">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. The 5-minute morning routine that changed my output"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
          />
        </Field>

        <Field label="Caption / script">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={8}
            placeholder="Write your post body. The selected hook will be prepended on publish."
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
          />
          {/* AI quality rating for the script/caption above — no save needed. */}
          <div className="mt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={runRate}
                disabled={rating || !caption.trim()}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {rating ? "Rating…" : "Rate script & caption"}
              </button>
              {contentRating && (
                <span className="flex items-center gap-2">
                  <ScorePill label="Script" score={contentRating.scriptScore} />
                  <ScorePill label="Caption" score={contentRating.captionScore} />
                </span>
              )}
            </div>

            {rateErr && <p className="mt-2 text-xs text-red-700">{rateErr}</p>}

            {contentRating && (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3 text-sm">
                <p className="font-medium">{contentRating.verdict}</p>

                {contentRating.improvements.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-1">
                      Improvements
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--color-muted)]">
                      {contentRating.improvements.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {contentRating.captionRewrites.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-1">
                      Rewrites — tap one to use it
                    </p>
                    <div className="space-y-2">
                      {contentRating.captionRewrites.map((rw, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setCaption(rw);
                            setContentRating(null);
                          }}
                          className="block w-full text-left text-xs p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-accent)]"
                          title="Replace your caption with this rewrite"
                        >
                          {rw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setContentRating(null)}
                  className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </Field>

        <Field label="Hashtags">
          <input
            value={hashtagsRaw}
            onChange={(e) => setHashtagsRaw(e.target.value)}
            placeholder="comma or space separated"
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
          />
          {hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hashtags.map((h) => (
                <span key={h} className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                  #{h}
                </span>
              ))}
            </div>
          )}
        </Field>

        {/* ManyChat CTA — keyword trigger + bot response */}
        <Field label="ManyChat CTA">
          <div className="space-y-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div>
              <label className="block text-[11px] font-semibold mb-1 text-emerald-200">
                Trigger keyword
              </label>
              <input
                value={ctaKeyword}
                onChange={(e) => setCtaKeyword(e.target.value.toUpperCase())}
                placeholder="e.g. GUIDE, DUMB, STACK"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-emerald-500/50 font-mono uppercase text-sm"
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
                  ? `You said ${ctaKeyword}! Here it is 🤩\n\nTap the button below to grab the full guide.`
                  : "What does the bot DM back? Set the keyword first."}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-emerald-500/50 resize-y text-sm"
              />
              {ctaKeyword.trim() && !ctaResponse.trim() && (
                <button
                  type="button"
                  onClick={() => setCtaResponse(`You said ${ctaKeyword}! Here it is 🤩\n\nI put together a full guide for you — tap the button below to grab it.\n\nLet me know if you have questions!`)}
                  className="mt-1.5 text-[11px] text-emerald-300 hover:underline"
                >
                  Generate template →
                </button>
              )}
            </div>

            {/* Guide file — the file the bot DMs when someone comments the keyword */}
            <div>
              <label className="block text-[11px] font-semibold mb-1 text-emerald-200">
                Guide file (the file the bot sends)
              </label>
              {guideFileUrl ? (
                <div className="flex gap-2 items-center">
                  <a
                    href={guideFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-mono hover:underline text-emerald-200"
                  >
                    {guideFileUrl.split("/").pop()}
                  </a>
                  <button
                    type="button"
                    onClick={async () => { try { await navigator.clipboard.writeText(guideFileUrl); } catch {} }}
                    className="text-[11px] px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30"
                  >
                    Copy URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideFileUrl(null)}
                    className="text-[11px] px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer inline-flex items-center gap-2 rounded border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 transition">
                  {guideFileUploading ? "Uploading…" : "Upload guide file (PDF, image, doc)"}
                  <input
                    type="file"
                    hidden
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.zip"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setGuideFileUploading(true);
                      try {
                        const url = await uploadOneFile(file);
                        setGuideFileUrl(url);
                      } catch {
                        setErr("Guide file upload failed");
                      } finally {
                        setGuideFileUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                </label>
              )}
            </div>

            <p className="text-[10px] text-[var(--color-muted)] leading-relaxed">
              Saved with the draft. Copy the keyword into your caption CTA (e.g. &quot;Comment {ctaKeyword || "KEYWORD"} for the full guide&quot;), paste the reply into ManyChat, and use the guide file&apos;s <strong className="text-emerald-300">Copy URL</strong> as the ManyChat button link — that&apos;s the file people receive.
            </p>
          </div>
        </Field>

        <Field
          label={
            mediaUrls.length > 1
              ? `Media (${mediaUrls.length} attached — Instagram will post as carousel)`
              : "Media (single image, video, or carousel up to 10)"
          }
        >
          {/* Drop-zone wrapper. dragover/leave/drop are handled at this
              level so the whole media area is a target — the user can
              drop on any blank space inside the slot, not just the
              button. Visual feedback via dashed border + accent tint. */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-lg p-3 transition border-2 ${
              isDragging
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 border-dashed"
                : "border-dashed border-transparent"
            }`}
          >
          {isDragging && (
            <div className="mb-2 text-center text-sm font-medium text-[var(--color-accent)]">
              Drop image or video to upload
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm">
              {mediaUrls.length === 0 ? <Upload className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {uploading
                ? "Uploading…"
                : mediaUrls.length === 0
                  ? "Upload (or drag & drop here)"
                  : "Add more"}
              <input
                type="file"
                hidden
                multiple
                accept="image/*,video/*"
                onChange={handleUpload}
                disabled={mediaUrls.length >= 10}
              />
            </label>
            <input
              type="url"
              placeholder="or paste a public URL and press Enter"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = e.currentTarget.value.trim();
                  if (/^https?:\/\//i.test(v) && mediaUrls.length < 10) {
                    setMediaUrls((cur) => [...cur, v]);
                    e.currentTarget.value = "";
                  }
                }
              }}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>

          {/* Carousel slot grid — always shows all 10 slots so the user can
              see at a glance how many images they can attach and where in
              the carousel order each one lives. Filled slots have the image
              + Primary badge + hover controls; empty slots are dashed boxes
              labeled with their position. The first slot is highlighted
              with the accent color even when empty to make the "Primary"
              concept obvious. */}
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, idx) => {
              const u = mediaUrls[idx];
              const filled = !!u;
              const isPrimary = idx === 0;
              return (
                <li
                  key={idx}
                  className={
                    "relative aspect-square rounded-lg overflow-hidden border-2 group transition " +
                    (filled
                      ? isPrimary
                        ? "border-[var(--color-accent)] bg-[var(--color-surface-2)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)]"
                      : isPrimary
                        ? "border-dashed border-[var(--color-accent)]/40 bg-[var(--color-surface)]"
                        : "border-dashed border-[var(--color-border)] bg-[var(--color-surface)]")
                  }
                >
                  {filled ? (
                    <>
                      {isImageUrl(u) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : isVideoUrl(u) ? (
                        // Actual video preview thumbnail. preload="metadata"
                        // pulls just the first frame, not the whole file —
                        // keeps the grid fast even with 10 video slots.
                        // Muted + playsInline lets the browser autoplay-tease
                        // on hover without sound. No controls because they'd
                        // clash with the slot's overlay buttons.
                        <video
                          src={u}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover bg-black"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                          media
                        </div>
                      )}
                      {isPrimary && (
                        <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wider bg-[var(--color-accent)] text-[var(--color-text-on-dark)] rounded px-1.5 py-0.5 font-medium">
                          Primary
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition"
                        aria-label="Remove"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => moveMediaToPrimary(idx)}
                          className="absolute bottom-1 left-1 right-1 text-[10px] py-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition font-medium"
                          title="Move to first position"
                        >
                          Make primary
                        </button>
                      )}
                    </>
                  ) : (
                    // Empty slot — labeled "1" / "2" / … so the carousel
                    // ordering is visible. Clicking it triggers the file
                    // picker which accepts BOTH images and videos. Shown
                    // sub-label makes that explicit since the icon alone
                    // reads as image-only.
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] transition">
                      <Plus className="w-5 h-5 mb-1 opacity-60" />
                      <span className="text-[10px] uppercase tracking-wider">
                        Slot {idx + 1}
                        {isPrimary ? " (Primary)" : ""}
                      </span>
                      <span className="text-[9px] text-[var(--color-muted)]/60 normal-case mt-0.5">
                        image or video
                      </span>
                      <input
                        type="file"
                        hidden
                        multiple
                        accept="image/*,video/*"
                        onChange={handleUpload}
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] text-[var(--color-muted)]">
            Up to 10 images per post · Instagram publishes the full set as a
            carousel · TikTok &amp; YouTube only post the Primary slot.
          </p>

          {/* ─── Background music (optional) ───────────────────────
              Heads-up shown alongside: platform APIs DO NOT let us
              attach TikTok/IG sound-library music programmatically
              (music licensing). For uploaded audio files we store the
              URL with the draft so it travels with the post; merging
              the audio INTO the video file is a separate Cloudinary /
              Mux integration that isn't wired yet. Until then the
              uploaded file shows up in the post preview as "Music
              attached" so the user knows to apply it manually when
              finalizing in the native app. */}
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-baseline justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wider text-[var(--color-muted)] flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5" /> Background music
                <span className="text-[10px] normal-case text-[var(--color-muted)]/70 ml-1">optional</span>
              </h4>
              <Link
                href="/trends"
                className="text-[11px] text-[var(--color-accent)] hover:underline inline-flex items-center gap-1"
                title="Browse trending TikTok / Instagram sounds"
              >
                Browse trending →
              </Link>
            </div>

            {musicUrl ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border">
                <Music2 className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Music attached</p>
                  <a
                    href={musicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[var(--color-muted)] truncate hover:underline inline-flex items-center gap-0.5"
                  >
                    Open audio file <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <button
                  type="button"
                  onClick={removeMusic}
                  className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-muted)] hover:text-red-700"
                  aria-label="Remove music"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="cursor-pointer flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium border border-dashed border-[var(--color-border)]">
                <Upload className="w-3.5 h-3.5" />
                {musicUploading ? "Uploading…" : "Upload audio (.mp3 / .m4a / .wav)"}
                <input
                  type="file"
                  hidden
                  accept="audio/*,.mp3,.m4a,.wav,.ogg"
                  onChange={handleMusicUpload}
                />
              </label>
            )}

            <p className="mt-1.5 text-[10px] text-[var(--color-muted)] leading-relaxed">
              <strong>Heads-up:</strong> Platform APIs don&apos;t let us
              auto-attach TikTok / Instagram sound-library music. Upload
              your own audio file here (we store it with the draft); merging
              it into the video file isn&apos;t wired yet — you&apos;ll
              still need to apply the sound when finalizing the post in the
              TikTok / Instagram app.
            </p>
          </div>

          {/* Opens the canvas editor on the PRIMARY image. The modal's
              textarea is fully editable — the user can type any text
              there, even if no hook/caption was set on the main page.
              Previously this button was gated on having hook OR caption
              already filled in, which made it look broken. Now: image
              present = button works. */}
          {/* Always render some state for this slot so the user knows
              why the button isn't clickable:
                - no media yet     → hint + greyed button
                - video uploaded   → "text on image" not applicable note
                - image uploaded   → live button */}
          {!primaryMediaUrl ? (
            <div className="mt-3 text-xs text-[var(--color-muted)] italic">
              Upload an image first, then you can write text directly on it
              with the next button.
            </div>
          ) : !isImageUrl(primaryMediaUrl) ? (
            <div className="mt-3 text-xs text-[var(--color-muted)] italic">
              &quot;Add text on image&quot; only works for images. Your primary
              attachment is a video.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOverlayOpen(true)}
              title="Open editor to write text directly on the image"
              className="mt-3 inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 font-semibold"
            >
              <Type className="w-4 h-4" />
              Add text on image (hook / caption)
            </button>
          )}
          </div>{/* /drop zone wrapper */}
        </Field>

        <Field label="Platforms">
          {/* "Select all connected" shortcut. Click to flip every
              connected + publish-supported platform on at once. The
              existing per-pill toggles stay for fine-grained control. */}
          {(() => {
            const eligible = ENABLED_PLATFORMS_ORDERED.filter(
              (p) => connectedPlatforms.includes(p) && PLATFORM_INFO[p].publishSupported,
            );
            const allSelected =
              eligible.length > 0 && eligible.every((p) => platforms.includes(p));
            if (eligible.length === 0) return null;
            return (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setPlatforms(allSelected ? [] : [...eligible])}
                  className="text-[11px] text-[var(--color-accent)] hover:underline font-medium"
                  title={
                    allSelected
                      ? "Deselect all platforms"
                      : `Post to all ${eligible.length} connected platforms at once`
                  }
                >
                  {allSelected
                    ? "Deselect all"
                    : `Select all (${eligible.length}) →`}
                </button>
              </div>
            );
          })()}
          <div className="flex flex-wrap gap-2">
            {ENABLED_PLATFORMS_ORDERED.map((p) => {
              const info = PLATFORM_INFO[p];
              const Icon = info.icon;
              const connected = connectedPlatforms.includes(p);
              const supported = info.publishSupported;
              const enabled = connected && supported;
              const on = platforms.includes(p) && enabled;

              let title = "";
              if (!supported) title = `${info.label} publishing coming soon — backend integration not built yet.`;
              else if (!connected) title = `Connect ${info.label} from the dashboard to enable.`;

              return (
                <button
                  key={p}
                  type="button"
                  disabled={!enabled}
                  onClick={() =>
                    setPlatforms((cur) =>
                      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
                    )
                  }
                  title={title}
                  style={
                    on
                      ? { backgroundColor: info.brandColor, color: "white", borderColor: info.brandColor }
                      : undefined
                  }
                  className={
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition " +
                    (!enabled
                      ? "bg-[var(--color-surface)] text-[var(--color-muted)] border-transparent line-through cursor-not-allowed opacity-60"
                      : on
                        ? "font-medium border-transparent"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)] hover:text-[var(--color-text)] hover:border-[var(--color-muted)]")
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  {info.label}
                  {!supported && (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-900 normal-case font-medium">
                      soon
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--color-border)]">
          <button
            onClick={save}
            disabled={saving || (!caption.trim() && mediaUrls.length === 0)}
            className="px-4 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>

          {/* Publish/Schedule popover. Click the button → small panel
              opens with two clear options: post immediately, or pick a
              date/time. No more "the button label changes based on
              whether I touched the datetime input" confusion. */}
          <div className="relative" ref={scheduleRef}>
            <button
              type="button"
              onClick={() => setScheduleOpen((o) => !o)}
              disabled={publishing || platforms.length === 0 || !caption.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {publishing
                ? scheduledFor
                  ? "Scheduling…"
                  : "Publishing…"
                : "Publish or schedule"}
            </button>

            {scheduleOpen && !publishing && (
              <div className="absolute left-0 bottom-full mb-2 w-80 bg-[var(--color-surface)] border rounded-xl shadow-2xl z-30 p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleOpen(false);
                    publish();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium text-sm hover:opacity-90"
                >
                  <Send className="w-4 h-4" />
                  Publish now to {platforms.length} platform
                  {platforms.length === 1 ? "" : "s"}
                </button>

                <div className="border-t border-[var(--color-border)] pt-3">
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5 flex items-center gap-1.5">
                    <CalendarClock className="w-3 h-3" /> Schedule for later
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] text-sm"
                    // Default min to now so the user can't pick a past date.
                    min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleOpen(false);
                      schedule();
                    }}
                    disabled={!scheduledFor}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CalendarClock className="w-4 h-4" />
                    {scheduledFor
                      ? `Schedule for ${new Date(scheduledFor).toLocaleString()}`
                      : "Pick a date + time above"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="w-full text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] py-1"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {savedAt && (
            <span className="text-xs text-[var(--color-muted)] flex items-center gap-1 ml-auto">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800" /> saved
            </span>
          )}
        </div>
      </div>

      {/* Right: hook suggester */}
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-accent)]" /> Hook A/B simulator
          </h3>
          <button
            onClick={generate}
            disabled={generating || !topic.trim()}
            className="text-xs px-3 py-1 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] disabled:opacity-50"
          >
            {generating ? "Thinking…" : "Generate"}
          </button>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Variants ranked by predicted engagement using your hook history (2× weight) and the niche pool.
        </p>
        {hooks.length === 0 ? (
          <div className="text-xs text-[var(--color-muted)] border rounded-lg bg-[var(--color-surface)] p-4">
            Enter a topic and click Generate. The first variant becomes your hook by default.
          </div>
        ) : (
          <ul className="space-y-2">
            {hooks.map((h, i) => {
              const active = selectedHook === h.text;
              return (
                <li key={i}>
                  <button
                    onClick={() => setSelectedHook(h.text)}
                    className={
                      "w-full text-left p-3 rounded-lg border " +
                      (active
                        ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]"
                        : "bg-[var(--color-surface)] hover:border-[var(--color-muted)]")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-snug">"{h.text}"</p>
                      {h.predictedER != null && (
                        <span className="text-xs font-semibold whitespace-nowrap text-[var(--color-accent)]">
                          {h.predictedER.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[10px] text-[var(--color-muted)]">
                      <span>{h.pattern?.replace(/_/g, " ") ?? "—"}</span>
                      {h.similarHookIds.length > 0 && (
                        <span>{h.similarHookIds.length} similar in DB</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>

    {/* Full-width preview — "see the post all together". Updates live as
        the user edits any field. Spans both columns on desktop so the
        image gets enough room to be legible. */}
    <div className="mt-6">
      <PostPreview
        hook={selectedHook}
        caption={caption}
        hashtags={hashtags}
        mediaUrls={mediaUrls}
        musicUrl={musicUrl}
        platforms={platforms}
      />
    </div>

    {/* Hook-on-image canvas modal. Operates on the PRIMARY image — the first
        attachment. When the user clicks Apply we REPLACE the primary slot
        with the new (text-baked) URL, preserving the rest of the carousel.
        Open as long as there's an image; the modal lets you type any text
        even when hook + caption are still blank on the parent page. */}
    {overlayOpen && primaryMediaUrl && (
      <HookOverlayEditor
        imageUrl={primaryMediaUrl}
        // Seed with whatever's typed in the parent fields if anything;
        // otherwise empty so the user can write fresh in the modal.
        initialHookText={
          selectedHook?.trim() && caption.trim()
            ? `${selectedHook}\n\n${caption}`
            : (selectedHook?.trim() || caption.trim() || "")
        }
        onApply={(newUrl) => {
          setMediaUrls((cur) => [newUrl, ...cur.slice(1)]);
          setOverlayOpen(false);
        }}
        onClose={() => setOverlayOpen(false)}
      />
    )}
    </>
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  const color = score >= 8 ? "bg-emerald-600" : score >= 5 ? "bg-amber-500" : "bg-red-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${color}`}>
      {label} {score}/10
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
