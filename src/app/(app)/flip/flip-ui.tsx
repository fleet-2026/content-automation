"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Link as LinkIcon,
  PenLine,
  Lightbulb,
  Image as ImageIcon,
  Video,
  Copy,
  Check,
  Loader2,
  Zap,
  Download,
  Send,
  Sparkles,
} from "lucide-react";
import {
  flipFromUrl,
  flipScript,
  ideasForNiche,
  buildImagePrompts,
  buildVideoPrompts,
  extractVideo,
  createImageFromFlip,
  createDraftFromFlip,
} from "./actions";

type Tab = "url" | "rewrite" | "ideas" | "image" | "video";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "url", label: "URL extract", icon: LinkIcon },
  { id: "rewrite", label: "Script rewrite", icon: PenLine },
  { id: "ideas", label: "Niche ideas", icon: Lightbulb },
  { id: "image", label: "Image prompts", icon: ImageIcon },
  { id: "video", label: "Video prompts", icon: Video },
];

export function FlipUI() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("url");

  // If trends sent us a URL, jump to URL tab. If something deep-linked
  // ?tab=image (e.g. "Use these images for prompts"), jump there instead.
  useEffect(() => {
    const t = params.get("tab");
    if (t === "image" || t === "video" || t === "ideas" || t === "rewrite" || t === "url") {
      setTab(t as Tab);
      return;
    }
    const u = params.get("url");
    if (u) setTab("url");
  }, [params]);

  return (
    <div>
      <div className="border-b border-[var(--color-border)] mb-6 flex flex-wrap gap-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                "px-4 py-2 text-sm flex items-center gap-2 border-b-2 -mb-px transition " +
                (active
                  ? "border-[var(--color-accent)] text-[var(--color-text)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]")
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "url" && <UrlTab initialUrl={params.get("url") ?? ""} router={router} />}
      {tab === "rewrite" && <RewriteTab router={router} />}
      {tab === "ideas" && <IdeasTab />}
      {tab === "image" && <ImageTab />}
      {tab === "video" && <VideoTab />}
    </div>
  );
}

// ─── URL EXTRACT ─────────────────────────────────────────────

type UrlExtractOut = {
  original: string;
  twisted: string;
  prompt?: string;
  sourceImages?: string[];
  thumbnail?: string;
  sourceUrl?: string;
  // Which backend served the result. "native" means FlipIt was down and
  // we used our own Apify + Claude pipeline as a fallback — useful to
  // surface in the UI so users know the result still came through.
  source?: "flipit" | "native";
};

const CAROUSEL_KEY = "flipit:lastCarouselUrls";
const CAROUSEL_SOURCE_KEY = "flipit:lastSourceUrl";

function persistCarousel(urls: string[] | undefined, sourceUrl: string) {
  const list = (urls ?? []).filter(Boolean);
  if (typeof window !== "undefined") {
    // For DevTools-console verification (matches the test plan).
    (window as unknown as { _lastCarouselUrls?: string[] })._lastCarouselUrls = list;
    try {
      sessionStorage.setItem(CAROUSEL_KEY, JSON.stringify(list));
      sessionStorage.setItem(CAROUSEL_SOURCE_KEY, sourceUrl);
    } catch {
      // sessionStorage may be unavailable (private mode etc.) — fail silent
    }
  }
}

function UrlTab({ initialUrl, router }: { initialUrl: string; router: ReturnType<typeof useRouter> }) {
  const [url, setUrl] = useState(initialUrl);
  const [out, setOut] = useState<UrlExtractOut | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Video download state — separate from the FlipIt text extract because
  // video extraction goes through Apify/tikwm and can take 10-30s.
  const [video, setVideo] = useState<{
    videoUrl?: string;
    thumbnailUrl?: string;
    author?: string;
    duration?: number;
    error?: string;
    source?: string;
  } | null>(null);
  const [videoPending, startVideo] = useTransition();

  // "Create image from flipped script" and "Create post" — quick chains
  // that turn a flipped result into actual content without leaving /flip.
  // The image goes through Imagen 4 (createImageFromFlip server action);
  // the draft creation uses createDraftFromFlip and navigates to /compose.
  const [genImage, setGenImage] = useState<string | null>(null);
  const [imagePending, startImage] = useTransition();
  const [draftPending, startDraft] = useTransition();
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => setUrl(initialUrl), [initialUrl]);

  function go() {
    if (!url.trim()) return;
    setErr(null);
    setOut(null);
    setVideo(null);
    start(async () => {
      try {
        const r = (await flipFromUrl(url.trim())) as UrlExtractOut;
        setOut(r);
        persistCarousel(r.sourceImages, url.trim());
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  function getVideo() {
    if (!url.trim()) return;
    setVideo(null);
    startVideo(async () => {
      try {
        const r = await extractVideo(url.trim());
        if (r.ok) {
          setVideo({
            videoUrl: r.videoUrl,
            thumbnailUrl: r.thumbnailUrl,
            author: r.author,
            duration: r.duration,
            source: r.source,
          });
        } else {
          setVideo({ error: r.error ?? "Video extraction failed.", source: r.source });
        }
      } catch (e) {
        setVideo({ error: String((e as Error).message ?? e) });
      }
    });
  }

  function createImage() {
    if (!out?.twisted?.trim()) return;
    setActionErr(null);
    setGenImage(null);
    startImage(async () => {
      try {
        // Image prompt = the flipped script. Imagen is good at narrative
        // prompts but the user can iterate via /studio Gemini Omni or the
        // Image prompts tab if they want a more deliberate prompt.
        const r = await createImageFromFlip({
          prompt: out.twisted,
          aspectRatio: "1:1",
        });
        setGenImage(r.url);
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function createPost() {
    if (!out?.twisted?.trim()) return;
    setActionErr(null);
    startDraft(async () => {
      try {
        const r = await createDraftFromFlip({
          caption: out.twisted,
          mediaUrl: genImage,
          // Hook left null — the user can pick one inside /compose's
          // Hook A/B simulator. Passing no hook avoids a duplicate
          // hook+caption display in the draft card.
        });
        router.push(`/compose?draft=${r.draftId}`);
      } catch (e) {
        setActionErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Paste a TikTok / IG / YouTube / X / LinkedIn URL">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@creator/video/123…"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
          />
          <button
            onClick={go}
            disabled={pending || !url.trim()}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Flip
          </button>
        </div>
      </Field>

      {err && <ErrorBox message={err} />}

      {/* Video download — works for TikTok + Instagram URLs. FlipIt only
          extracts text + image thumbnails, so this is a separate step
          that uses tikwm (TikTok, fast + free) or Apify (IG + TikTok
          fallback) to fetch the actual downloadable video URL. Available
          alongside the Flip output so the user can grab the source video
          regardless of whether the text extract succeeded. */}
      {url.trim() && (
        <div className="border rounded-xl bg-[var(--color-surface)] p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Download className="w-4 h-4 text-[var(--color-accent)]" />
                Download original video
              </h3>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                Pulls the unwatermarked video file from TikTok / Instagram.
              </p>
            </div>
            <button
              onClick={getVideo}
              disabled={videoPending}
              className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {videoPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" /> Get video
                </>
              )}
            </button>
          </div>

          {video?.error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {video.error}
              {video.source === "unsupported" && (
                <div className="mt-1 text-[10px] text-red-900/70">
                  Supported: tiktok.com, instagram.com URLs.
                </div>
              )}
            </div>
          )}

          {video?.videoUrl && (
            <div className="space-y-2">
              <video
                src={video.videoUrl}
                controls
                playsInline
                poster={video.thumbnailUrl}
                className="w-full max-h-[60vh] rounded-lg bg-black"
                preload="metadata"
              />
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={video.videoUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Download MP4
                </a>
                {video.author && (
                  <span className="text-[11px] text-[var(--color-muted)]">
                    @{video.author}
                    {video.duration ? ` · ${video.duration}s` : ""}
                  </span>
                )}
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] ml-auto">
                  via {video.source}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {out && (
        <div className="space-y-4">
          {/* When the result came from our native fallback (because FlipIt
              was returning 5xx), let the user know — they might wonder why
              the output is slightly different from a normal Flip. */}
          {out.source === "native" && (
            <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              FlipIt was unavailable so we served this from our native Apify +
              Claude pipeline. Output quality is similar; ping me if it&apos;s
              missing something.
            </div>
          )}
          {out.sourceImages && out.sourceImages.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-2">
                Source images ({out.sourceImages.length}) · saved for vision-based image prompts
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {out.sourceImages.slice(0, 12).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt={`slide ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    width={400}
                    height={400}
                    className="aspect-square w-full object-cover rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <OutputCard title="Original caption" body={out.original} />
            <OutputCard title="Flipped — viral version" body={out.twisted} highlight />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Primary chain: generate an image from the flipped script,
                then "Create post" pulls both into a draft. The buttons
                appear in chain order so the user sees Image → Post as a
                natural left-to-right flow. */}
            <button
              onClick={createImage}
              disabled={imagePending || draftPending}
              className="text-sm py-2 px-4 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium inline-flex items-center gap-2 disabled:opacity-50"
              title="Generate an image via Imagen 4 from the flipped script"
            >
              {imagePending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {imagePending ? "Generating image…" : genImage ? "Regenerate image" : "Create image"}
            </button>
            <button
              onClick={createPost}
              disabled={draftPending || imagePending}
              className="text-sm py-2 px-4 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text)] font-medium border border-[var(--color-border)] inline-flex items-center gap-2 disabled:opacity-50"
              title={
                genImage
                  ? "Create a draft with the flipped script + generated image, then open it in Compose"
                  : "Create a draft with the flipped script (no image), then open it in Compose"
              }
            >
              {draftPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {draftPending ? "Creating draft…" : genImage ? "Create post (with image)" : "Create post"}
            </button>
            <button
              onClick={() => router.push(`/compose?prefill=${encodeURIComponent(out.twisted)}`)}
              className="text-sm py-2 px-4 rounded-lg bg-transparent text-[var(--color-muted)] hover:text-[var(--color-text)] font-medium"
              title="Open Compose with just the prefilled caption (no draft created yet)"
            >
              Open in Compose →
            </button>
            {out.sourceImages && out.sourceImages.length > 0 && (
              <button
                onClick={() =>
                  router.push(
                    `/flip?tab=image&useCarousel=1`, // ImageTab will read from sessionStorage
                  )
                }
                className="text-sm py-2 px-4 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text)] font-medium border border-[var(--color-border)] inline-flex items-center gap-2"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Use these images for prompts →
              </button>
            )}
          </div>

          {/* Inline error from createImage / createPost */}
          {actionErr && (
            <div className="bg-red-50 border border-red-200 text-red-900 text-xs rounded-md px-3 py-2">
              {actionErr}
            </div>
          )}

          {/* Generated image preview — shows up after createImage succeeds.
              Has its own use-in-draft path that bypasses the chain in case
              the user wants to just take the image without making a post. */}
          {genImage && (
            <div className="border rounded-xl bg-[var(--color-surface)] p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                Generated image (Imagen 4)
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={genImage}
                alt="Generated from flipped script"
                loading="lazy"
                className="w-full max-w-sm rounded-lg bg-black"
              />
              <a
                href={genImage}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                <Download className="w-3 h-3" /> Download PNG
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SCRIPT REWRITE ──────────────────────────────────────────

function RewriteTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const [script, setScript] = useState("");
  const [tone, setTone] = useState("punchy");
  const [platform, setPlatform] = useState("TikTok");
  const [out, setOut] = useState<{ rewritten: string; hook: string; cta: string } | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    if (!script.trim()) return;
    setErr(null);
    setOut(null);
    start(async () => {
      try {
        setOut(await flipScript({ script, tone, platform }));
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Your raw script or caption">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={7}
          placeholder="Paste your draft. We'll rewrite it for virality."
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tone">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
          >
            {["punchy", "controversial", "educational", "story", "urgent", "playful"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Platform">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
          >
            {["TikTok", "Instagram", "YouTube Shorts", "LinkedIn", "X"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
      </div>
      <button
        onClick={go}
        disabled={pending || !script.trim()}
        className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
        Rewrite
      </button>

      {err && <ErrorBox message={err} />}

      {out && (
        <div className="space-y-3">
          <OutputCard title="Hook (first line)" body={out.hook} highlight />
          <OutputCard title="Rewritten script" body={out.rewritten} />
          <OutputCard title="CTA" body={out.cta} />
          <button
            onClick={() =>
              router.push(
                `/compose?prefill=${encodeURIComponent(`${out.hook}\n\n${out.rewritten}\n\n${out.cta}`)}`,
              )
            }
            className="w-full text-sm py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium"
          >
            Send to Compose →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── NICHE IDEAS ─────────────────────────────────────────────

function IdeasTab() {
  const [niche, setNiche] = useState("ai");
  const [desc, setDesc] = useState("");
  const [out, setOut] = useState<{ twisted: string } | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    if (!niche.trim() || !desc.trim()) return;
    setErr(null);
    setOut(null);
    start(async () => {
      try {
        setOut(await ideasForNiche({ niche, description: desc }));
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Niche">
        <input
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="ai, fitness, finance, parenting…"
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
        />
      </Field>
      <Field label="Describe the angle / audience">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          placeholder="Solo founders shipping AI products. Punchy, contrarian, builder-first."
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
        />
      </Field>
      <button
        onClick={go}
        disabled={pending || !niche.trim() || !desc.trim()}
        className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
        Generate ideas
      </button>

      {err && <ErrorBox message={err} />}
      {out && <OutputCard title="3 viral ideas" body={out.twisted} highlight />}
    </div>
  );
}

// ─── IMAGE PROMPTS ───────────────────────────────────────────

function ImageTab() {
  const [mode, setMode] = useState<"script" | "scaffold">("script");
  const [script, setScript] = useState("");
  const [niche, setNiche] = useState("ai");
  const [event, setEvent] = useState("");
  const [style, setStyle] = useState("photorealistic");
  const [count, setCount] = useState(4);
  const [extra, setExtra] = useState("");
  const [prompts, setPrompts] = useState<{ label: string; prompt: string }[] | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Carousel URLs persisted by UrlTab after Extract & Flip.
  const [carouselUrls, setCarouselUrls] = useState<string[]>([]);
  const [carouselSource, setCarouselSource] = useState<string>("");
  const [useVision, setUseVision] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(CAROUSEL_KEY);
      const src = sessionStorage.getItem(CAROUSEL_SOURCE_KEY) ?? "";
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      setCarouselUrls(Array.isArray(list) ? list : []);
      setCarouselSource(src);
      // Auto-enable if user clicked "Use these images" on URL tab
      const params = new URLSearchParams(window.location.search);
      if (params.get("useCarousel") === "1" && list.length > 0) {
        setUseVision(true);
      }
    } catch {
      // ignore
    }
  }, []);

  function go() {
    setErr(null);
    setPrompts(null);
    const visionImages = useVision && carouselUrls.length > 0 ? carouselUrls : undefined;
    start(async () => {
      try {
        const res =
          mode === "script"
            ? await buildImagePrompts({ flippedScript: script, count, sourceImages: visionImages })
            : await buildImagePrompts({ niche, event, style, count, extra, sourceImages: visionImages });
        setPrompts(res.prompts);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 text-xs">
        <button
          onClick={() => setMode("script")}
          className={
            "px-3 py-1 rounded " +
            (mode === "script"
              ? "bg-white text-black"
              : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
          }
        >
          From script
        </button>
        <button
          onClick={() => setMode("scaffold")}
          className={
            "px-3 py-1 rounded " +
            (mode === "scaffold"
              ? "bg-white text-black"
              : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
          }
        >
          From scaffold
        </button>
      </div>

      {mode === "script" ? (
        <Field label="Flipped script">
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
          />
        </Field>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Niche">
            <input
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
            />
          </Field>
          <Field label="Event / hook moment">
            <input
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="e.g. dramatic before/after"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
            />
          </Field>
          <Field label="Style">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
            >
              {["photorealistic", "cinematic", "anime", "3D render", "minimal", "neon", "retro"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Extra (optional)">
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="vertical 9:16, dramatic lighting…"
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
            />
          </Field>
        </div>
      )}

      <Field label={`Count: ${count}`}>
        <input
          type="range"
          min={1}
          max={8}
          value={count}
          onChange={(e) => setCount(+e.target.value)}
          className="w-full"
        />
      </Field>

      {carouselUrls.length > 0 && (
        <div className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface)]">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={useVision}
              onChange={(e) => setUseVision(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium">
                Vision mode — describe what&apos;s actually visible
              </div>
              <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                Use the {carouselUrls.length} image(s) from your last extract
                {carouselSource && (
                  <>
                    {" "}
                    (
                    <a
                      href={carouselSource}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      source post
                    </a>
                    )
                  </>
                )}
                . Claude will base prompts on the actual subjects, framing, and
                colors — not guesses from the caption.
              </div>
              <div className="flex gap-1 mt-2">
                {carouselUrls.slice(0, 6).map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={u}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={40}
                    height={40}
                    className="w-10 h-10 object-cover rounded border border-[var(--color-border)]"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            </div>
          </label>
        </div>
      )}

      <button
        onClick={go}
        disabled={pending || (mode === "script" ? !script.trim() : !niche.trim())}
        className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        {useVision && carouselUrls.length > 0
          ? `Generate from ${carouselUrls.length} image(s)`
          : "Generate image prompts"}
      </button>
      {mode === "script" && !script.trim() && (
        <p className="text-xs text-[var(--color-muted)]">
          Paste a flipped script first, or switch to "From scaffold" to generate from a niche.
        </p>
      )}

      {err && <ErrorBox message={err} />}

      {prompts && (
        <div className="space-y-2">
          {prompts.map((p, i) => (
            <OutputCard key={i} title={p.label} body={p.prompt} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── VIDEO PROMPTS ───────────────────────────────────────────

function VideoTab() {
  const [script, setScript] = useState("");
  const [platform, setPlatform] = useState("Runway");
  const [prompts, setPrompts] = useState<{ label: string; prompt: string }[] | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function go() {
    if (!script.trim()) return;
    setErr(null);
    setPrompts(null);
    start(async () => {
      try {
        const r = await buildVideoPrompts({ flippedScript: script, platform });
        setPrompts(r.prompts);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Field label="Flipped script">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={7}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
        />
      </Field>
      <Field label="Target generator">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
        >
          {["Runway", "Pika", "Sora", "Veo 3", "Kling"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </Field>
      <button
        onClick={go}
        disabled={pending || !script.trim()}
        className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
        Generate video prompts
      </button>

      {err && <ErrorBox message={err} />}

      {prompts && (
        <div className="space-y-2">
          {prompts.map((p, i) => (
            <OutputCard key={i} title={p.label} body={p.prompt} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── shared bits ─────────────────────────────────────────────

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

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-100 text-red-800 text-sm px-4 py-3">
      <span className="font-semibold">Error: </span>
      {message}
    </div>
  );
}

function OutputCard({
  title,
  body,
  highlight,
}: {
  title: string;
  body: string;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={
        "border rounded-xl p-4 " +
        (highlight ? "bg-[var(--color-accent)]/10 border-[var(--color-accent)]" : "bg-[var(--color-surface)]")
      }
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{title}</span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(body);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] inline-flex items-center gap-1 shrink-0"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-800" /> : <Copy className="w-3 h-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
    </div>
  );
}
