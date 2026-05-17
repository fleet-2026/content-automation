"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, Send, CalendarClock, CheckCircle2, Type, X, Plus } from "lucide-react";
import { generateHookVariants, saveDraft, publishDraftNow, scheduleDraft } from "./actions";
import type { Platform } from "@prisma/client";
import { HookOverlayEditor } from "./hook-overlay-editor";
import { PostPreview } from "./post-preview";
import { parseMediaUrls, packMediaUrls, isImageUrl } from "@/lib/media-urls";

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

const ALL_PLATFORMS: Platform[] = ["INSTAGRAM", "YOUTUBE", "TIKTOK"];

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
  const [platforms, setPlatforms] = useState<Platform[]>(
    initialDraft?.platforms.length ? initialDraft.platforms : connectedPlatforms,
  );
  const [scheduledFor, setScheduledFor] = useState<string>(initialDraft?.scheduledFor ?? "");
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

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
          mediaUrl: packMediaUrls(mediaUrls),
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
            mediaUrl: packMediaUrls(mediaUrls),
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
            mediaUrl: packMediaUrls(mediaUrls),
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

          {/* Attached-media list: thumbnail for images, "video" pill for clips.
              First item gets a "PRIMARY" badge (used by hook-on-image + as the
              feed thumbnail on platforms that can't carousel). Reorder by
              clicking "Make primary" on any non-first card. Remove with X. */}
          {mediaUrls.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {mediaUrls.map((u, idx) => (
                <li
                  key={`${u}-${idx}`}
                  className={
                    "relative aspect-square rounded-lg overflow-hidden bg-[var(--color-surface-2)] border group " +
                    (idx === 0 ? "border-[var(--color-accent)]" : "")
                  }
                >
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
                  {idx === 0 && (
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
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => moveMediaToPrimary(idx)}
                      className="absolute bottom-1 left-1 right-1 text-[10px] py-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition font-medium"
                      title="Move to first position"
                    >
                      Make primary
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

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
          <div className="flex gap-2">
            {ALL_PLATFORMS.map((p) => {
              const enabled = connectedPlatforms.includes(p);
              const on = platforms.includes(p);
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
                  className={
                    "px-3 py-1.5 rounded-full text-xs " +
                    (!enabled
                      ? "bg-[var(--color-surface)] text-[var(--color-muted)] line-through cursor-not-allowed"
                      : on
                        ? "bg-white text-black"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]")
                  }
                >
                  {p.toLowerCase()}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Schedule for (optional)">
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] text-sm"
          />
        </Field>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--color-border)]">
          <button
            onClick={save}
            disabled={saving || !caption.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          {scheduledFor ? (
            <button
              onClick={schedule}
              disabled={publishing || platforms.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50"
            >
              <CalendarClock className="w-4 h-4" /> Schedule
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={publishing || platforms.length === 0 || !caption.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {publishing ? "Publishing…" : "Publish now"}
            </button>
          )}
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
        // The textarea inside the editor is fully editable, so the user can
        // delete one or both, or type something entirely different.
        initialHookText={
          selectedHook?.trim() && caption.trim()
            ? `${selectedHook}\n\n${caption}`.slice(0, 300)
            : (selectedHook ?? caption).slice(0, 300)
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
