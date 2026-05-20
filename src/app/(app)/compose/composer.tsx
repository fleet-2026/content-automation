"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, Send, CalendarClock, CheckCircle2, Type, X, Plus, Music2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { generateHookVariants, saveDraft, publishDraftNow, scheduleDraft } from "./actions";
import type { Platform } from "@prisma/client";
import { HookOverlayEditor } from "./hook-overlay-editor";
import { PostPreview } from "./post-preview";
import { parseMediaUrls, parseMusicUrl, packMediaUrls, isImageUrl } from "@/lib/media-urls";
import { PLATFORM_INFO, ENABLED_PLATFORMS_ORDERED } from "@/lib/platform-info";

type Hook = {
  text: string;
  pattern: string | null;
  predictedER: number | null;
  similarHookIds: string[];
  reasoning?: string;
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


export function Composer({
  connectedPlatforms,
  initialDraft,
  initialCaptionPrefill,
  initialMediaUrl,
}: {
  connectedPlatforms: Platform[];
  initialDraft?: InitialDraft;
  initialCaptionPrefill?: string | null;
  /** Pre-attach a media URL when starting a fresh draft (e.g. from
   * /compose?mediaUrl=… on the Drafts page "Use in new draft" link). Only
   * applied when no initialDraft is provided so we don't clobber an existing
   * draft's media. */
  initialMediaUrl?: string | null;
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

  const [topic, setTopic] = useState("");
  const [caption, setCaption] = useState(() => {
    if (initialDraft) return captionWithoutHook(initialDraft.caption, initialDraft.selectedHook);
    if (initialCaptionPrefill) return initialCaptionPrefill;
    return "";
  });
  const [hashtagsRaw, setHashtagsRaw] = useState(() =>
    initialDraft ? initialDraft.hashtags.map((h) => `#${h}`).join(" ") : "",
  );
  const [hooks, setHooks] = useState<Hook[]>(() => initialDraft?.hookOptions ?? []);
  const [selectedHook, setSelectedHook] = useState<string | null>(
    initialDraft?.selectedHook ?? null,
  );
  // Multi-image state. Backed by a packed string on the Draft.mediaUrl field
  // (newline-separated URLs) until a proper schema migration lands. The first
  // entry is the "primary" — used for the hook-on-image overlay, the cards,
  // and single-platform publishing fallback (TikTok/YouTube can only post
  // one media; Instagram supports up to 10 in a carousel).
  const [mediaUrls, setMediaUrls] = useState<string[]>(() => {
    if (initialDraft) return parseMediaUrls(initialDraft.mediaUrl);
    if (initialMediaUrl) return [initialMediaUrl];
    return [];
  });
  const primaryMediaUrl = mediaUrls[0] ?? null;

  // Background music URL packed into the same Draft.mediaUrl field via the
  // `audio::` prefix. See src/lib/media-urls.ts. We display it separately
  // from visual media in the UI, but it travels with the draft.
  const [musicUrl, setMusicUrl] = useState<string | null>(() => {
    if (initialDraft) return parseMusicUrl(initialDraft.mediaUrl);
    return null;
  });
  const [musicUploading, setMusicUploading] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(
    initialDraft?.platforms.length ? initialDraft.platforms : connectedPlatforms,
  );
  const [scheduledFor, setScheduledFor] = useState<string>(initialDraft?.scheduledFor ?? "");
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
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

  const [generating, startGen] = useTransition();
  const [saving, startSave] = useTransition();
  const [publishing, startPub] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hashtags = hashtagsRaw
    .split(/[,\s]+/)
    .map((s) => s.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean);

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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow picking multiple files at once — we upload them sequentially
    // (the API only accepts one file per request) and append each new URL
    // to the carousel list. Cap at 10 since Instagram's carousel API has
    // that hard limit; the other platforms only consume the first item.
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setErr(null);
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of files) {
        if (mediaUrls.length + newUrls.length >= 10) {
          throw new Error("Max 10 images per post (Instagram carousel limit).");
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body?.message || body?.error || `HTTP ${res.status}`;
          throw new Error(`Upload failed: ${msg}`);
        }
        const { url } = (await res.json()) as { url: string };
        newUrls.push(url);
      }
      setMediaUrls((cur) => [...cur, ...newUrls]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
      // reset input so picking the same file again still triggers onChange
      e.target.value = "";
    }
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
        let id = draftId;
        if (!id) {
          const d = await saveDraft({
            caption: selectedHook ? `${selectedHook}\n\n${caption}` : caption,
            hashtags,
            hookOptions: hooks,
            selectedHook,
            mediaUrl: packMediaUrls(mediaUrls, { musicUrl }),
            platforms,
          });
          id = d.id;
          setDraftId(id);
        }
        await publishDraftNow(id);
        router.push("/drafts");
        router.refresh();
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
        let id = draftId;
        if (!id) {
          const d = await saveDraft({
            caption: selectedHook ? `${selectedHook}\n\n${caption}` : caption,
            hashtags,
            hookOptions: hooks,
            selectedHook,
            mediaUrl: packMediaUrls(mediaUrls, { musicUrl }),
            platforms,
            scheduledFor,
          });
          id = d.id;
          setDraftId(id);
        } else {
          await scheduleDraft(id, scheduledFor);
        }
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

        <Field
          label={
            mediaUrls.length > 1
              ? `Media (${mediaUrls.length} attached — Instagram will post as carousel)`
              : "Media (single image, video, or carousel up to 10)"
          }
        >
          <div className="flex items-center gap-3 flex-wrap">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm">
              {mediaUrls.length === 0 ? <Upload className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {uploading
                ? "Uploading…"
                : mediaUrls.length === 0
                  ? "Upload"
                  : "Add image"}
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
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                          video
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
                    // picker just like the "Add image" button does.
                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] transition">
                      <Plus className="w-5 h-5 mb-1 opacity-60" />
                      <span className="text-[10px] uppercase tracking-wider">
                        Slot {idx + 1}
                        {isPrimary ? " (Primary)" : ""}
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

          {/* Opens the canvas editor on the PRIMARY image. The text inside is
              fully editable — the user can put the hook, the caption, both,
              or anything custom on the image. */}
          {primaryMediaUrl && isImageUrl(primaryMediaUrl) && (
            <button
              type="button"
              onClick={() => setOverlayOpen(true)}
              disabled={!selectedHook?.trim() && !caption.trim()}
              title={
                !selectedHook?.trim() && !caption.trim()
                  ? "Pick a hook or type a caption first"
                  : "Bake hook or caption text onto the primary image"
              }
              className="mt-3 flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Type className="w-3.5 h-3.5" />
              Add text on image (hook / caption)
            </button>
          )}
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
            disabled={saving || !caption.trim()}
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
        with the new (text-baked) URL, preserving the rest of the carousel. */}
    {overlayOpen && primaryMediaUrl && (selectedHook?.trim() || caption.trim()) && (
      <HookOverlayEditor
        imageUrl={primaryMediaUrl}
        // Seed with hook + caption when both are present, separated by a
        // blank line so the canvas wrap renders them as two visual blocks.
        // The textarea inside the editor is fully editable + tall, so the
        // user can see all of it and trim/rewrite as needed. No char cap
        // here — past complaint was the seed truncated the caption.
        initialHookText={
          selectedHook?.trim() && caption.trim()
            ? `${selectedHook}\n\n${caption}`
            : selectedHook ?? caption
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
