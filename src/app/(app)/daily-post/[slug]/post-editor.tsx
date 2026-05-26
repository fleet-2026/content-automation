"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  updatePost,
  setPublished,
  setMedia,
  uploadMedia,
  generateVideoPrompt,
  saveVideoPrompt,
  rateHook,
  replaceHook,
  publishToSocial,
  checkAccountHealth,
} from "../actions";
import type { Platform } from "@prisma/client";
import {
  createAvatarVideo,
  pollAsset,
  listHeygenAvatars,
  listHeygenVoices,
} from "@/app/(app)/studio/actions";
import type { DailyPost } from "../data";

type HookRating = {
  overallScore: number;
  verdict: string;
  scores: {
    curiosityGap: number;
    specificity: number;
    patternInterrupt: number;
    clarity: number;
    relevance: number;
  };
  strengths: string[];
  weaknesses: string[];
  rewrites: string[];
};

export default function PostEditor({ post }: { post: DailyPost }) {
  const g = post.generated;
  const [hook, setHook] = useState(g?.hook ?? "");
  const [script, setScript] = useState(g?.script ?? "");
  const [caption, setCaption] = useState(g?.caption ?? "");
  const [hashtagsRaw, setHashtagsRaw] = useState(
    (g?.hashtags ?? []).join(" "),
  );
  const [keyword, setKeyword] = useState(g?.keyword ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [published, setPublishedState] = useState<boolean>(!!post.isPublished);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  // Media state — initialized from the server-rendered guide so the
  // upload section shows what's already saved. After upload + setMedia
  // server action, we update local state immediately so the preview
  // appears without a full page reload.
  // Video-prompt brief state — separate from media URLs since it's a
  // text artifact, not a binary upload.
  const [videoPrompt, setVideoPromptText] = useState<string>(post.videoPrompt ?? "");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Hook rating panel state — populated on demand by the "Rate this
  // post" button. Includes 3 alternate hook rewrites the admin can
  // swap in with one click.
  const [hookRating, setHookRating] = useState<HookRating | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const runRateHook = async () => {
    setRatingError(null);
    setIsRating(true);
    try {
      // Persist any pending hook edit before rating so the score reflects
      // what's currently typed, not whatever last auto-saved.
      await updatePost(post.slug, { hook });
      const res = await rateHook(post.slug);
      if (!res.ok || !res.rating) throw new Error(res.error ?? "Rating failed");
      setHookRating(res.rating);
    } catch (e) {
      setRatingError((e as Error).message);
    } finally {
      setIsRating(false);
    }
  };

  const useRewrite = async (rewrite: string) => {
    setHook(rewrite);
    await replaceHook(post.slug, rewrite);
    // Re-rate automatically so the admin sees the new score immediately.
    setHookRating(null);
  };

  const runGeneratePrompt = async () => {
    setPromptError(null);
    setIsGeneratingPrompt(true);
    try {
      const res = await generateVideoPrompt(post.slug);
      if (!res.ok) throw new Error(res.error ?? "Generation failed");
      setVideoPromptText(res.text ?? "");
    } catch (e) {
      setPromptError((e as Error).message);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const persistVideoPrompt = (text: string) => {
    // Fire-and-forget save on textarea blur. The action revalidates the
    // page server-side; no need to await the result for UI flow.
    void saveVideoPrompt(post.slug, text);
  };

  const [videoUrl, setVideoUrl] = useState<string | null>(post.videoUrl ?? null);

  // HeyGen state — list of trained avatars + available voices loaded on
  // mount from the HeyGen API. The selected avatar/voice persists per-user
  // in localStorage so they don't have to repick on every guide.
  type HGAvatar = { avatar_id: string; avatar_name: string; preview_image_url?: string };
  type HGVoice = { voice_id: string; name: string; language: string; gender: string };
  const [heygenAvatars, setHeygenAvatars] = useState<HGAvatar[]>([]);
  const [heygenVoices, setHeygenVoices] = useState<HGVoice[]>([]);
  const [heygenAvatarId, setHeygenAvatarId] = useState<string>("");
  const [heygenVoiceId, setHeygenVoiceId] = useState<string>("");
  const [heygenLoading, setHeygenLoading] = useState(false);
  const [heygenStatus, setHeygenStatus] = useState<string>(""); // running progress text
  const [heygenError, setHeygenError] = useState<string | null>(null);

  // Load HeyGen avatars + voices on mount + restore last-used selection
  // from localStorage. Failures (no API key, network) leave the dropdowns
  // empty + show an inline hint instead of crashing the page.
  useEffect(() => {
    (async () => {
      try {
        const [avatars, voices] = await Promise.all([
          listHeygenAvatars(),
          listHeygenVoices(),
        ]);
        setHeygenAvatars(avatars as HGAvatar[]);
        setHeygenVoices(voices as HGVoice[]);
        if (typeof window !== "undefined") {
          const a = window.localStorage.getItem("heygen:lastAvatarId") ?? "";
          const v = window.localStorage.getItem("heygen:lastVoiceId") ?? "";
          if (a && (avatars as HGAvatar[]).some((x) => x.avatar_id === a)) {
            setHeygenAvatarId(a);
          }
          if (v && (voices as HGVoice[]).some((x) => x.voice_id === v)) {
            setHeygenVoiceId(v);
          }
        }
      } catch (e) {
        setHeygenError((e as Error).message);
      }
    })();
  }, []);

  // Save user's choices so the next guide remembers them.
  useEffect(() => {
    if (typeof window !== "undefined" && heygenAvatarId) {
      window.localStorage.setItem("heygen:lastAvatarId", heygenAvatarId);
    }
  }, [heygenAvatarId]);
  useEffect(() => {
    if (typeof window !== "undefined" && heygenVoiceId) {
      window.localStorage.setItem("heygen:lastVoiceId", heygenVoiceId);
    }
  }, [heygenVoiceId]);

  // Run the HeyGen job: kick off via createAvatarVideo → poll the
  // /api/studio/poll endpoint until READY → save the resulting MP4 URL
  // to DailyGuide.videoUrl via setMedia → update local state so the
  // existing video preview tile shows it.
  const runHeyGenGenerate = async () => {
    setHeygenError(null);
    if (!script.trim()) {
      setHeygenError("Talking-head script is empty — fill it in first.");
      return;
    }
    if (!heygenAvatarId) {
      setHeygenError("Pick an avatar.");
      return;
    }
    if (!heygenVoiceId) {
      setHeygenError("Pick a voice.");
      return;
    }
    setHeygenLoading(true);
    setHeygenStatus("Kicking off HeyGen job…");
    try {
      const placeholder = await createAvatarVideo({
        script: script.trim(),
        avatarId: heygenAvatarId,
        voiceId: heygenVoiceId,
        aspect: "9:16",
      });
      setHeygenStatus("Rendering — usually 2-5 min…");
      // Poll every 4s for up to 10 min.
      const deadline = Date.now() + 10 * 60 * 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() > deadline) {
          throw new Error("Timed out after 10 min — check HeyGen dashboard.");
        }
        await new Promise((r) => setTimeout(r, 4000));
        const a = await pollAsset(placeholder.id);
        if (!a) throw new Error("Asset disappeared.");
        if (a.status === "READY" && a.url) {
          setHeygenStatus("Saving to guide…");
          await setMedia(post.slug, { videoUrl: a.url });
          setVideoUrl(a.url);
          setHeygenStatus("");
          break;
        }
        if (a.status === "FAILED") {
          throw new Error(a.error || "HeyGen render failed");
        }
        // else still rendering — keep polling
      }
    } catch (e) {
      setHeygenError((e as Error).message);
      setHeygenStatus("");
    } finally {
      setHeygenLoading(false);
    }
  };
  const [imageUrls, setImageUrls] = useState<string[]>(post.imageUrls ?? []);
  const [uploadingKind, setUploadingKind] = useState<"video" | "image" | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);

  // Social publish state — platform toggles + per-platform results.
  const AVAILABLE_PLATFORMS: { key: Platform; label: string; color: string }[] = [
    { key: "INSTAGRAM", label: "Instagram", color: "#E1306C" },
    { key: "TIKTOK", label: "TikTok", color: "#000000" },
    { key: "FACEBOOK", label: "Facebook", color: "#1877F2" },
  ];
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "INSTAGRAM", "TIKTOK", "FACEBOOK",
  ]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<
    { platform: string; ok: boolean; url?: string; error?: string }[] | null
  >(null);

  // Account health check — runs on mount to show which accounts are valid
  const [accountHealth, setAccountHealth] = useState<
    { platform: string; ok: boolean; detail: string; scopes?: string[] }[] | null
  >(null);
  useEffect(() => {
    checkAccountHealth().then((r) => setAccountHealth(r.accounts));
  }, []);

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const runPublishToSocial = async () => {
    setPublishError(null);
    setPublishResults(null);
    setIsPublishing(true);
    try {
      const res = await publishToSocial(post.slug, selectedPlatforms);
      if (!res.ok) throw new Error(res.error ?? "Publish failed");
      setPublishResults(res.results ?? []);
    } catch (e) {
      setPublishError((e as Error).message);
    } finally {
      setIsPublishing(false);
    }
  };

  // Upload a file to R2.
  // Small files (≤ 4 MB): Server Action (no CORS needed).
  // Larger files: presigned URL (browser PUTs directly to R2).
  // Presigned path needs R2 CORS configured in Cloudflare dashboard.
  const SA_LIMIT = 4 * 1024 * 1024;
  const MAX_UPLOAD = 200 * 1024 * 1024;

  const uploadOne = async (file: File): Promise<string> => {
    if (file.size > MAX_UPLOAD) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      throw new Error(`File is ${sizeMB} MB — max is 200 MB.`);
    }
    if (file.size <= SA_LIMIT) {
      const form = new FormData();
      form.append("file", file);
      const res = await uploadMedia(form);
      if (!res.ok) throw new Error(res.error ?? "Upload failed");
      return res.url;
    }
    return uploadViaPresign(file);
  };

  const uploadViaPresign = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
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

    try {
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!putRes.ok) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`R2 error ${putRes.status}: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        throw new Error(
          "Upload blocked — R2 CORS not configured. " +
          "Go to Cloudflare Dashboard > R2 > bucket > Settings > CORS Policy. " +
          "Add: Origin = https://creator-os-delta.vercel.app, Methods = PUT+GET+HEAD, Headers = *"
        );
      }
      throw e;
    }
    return publicUrl;
  };

  const handleVideoSelected = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    setUploadingKind("video");
    try {
      const url = await uploadOne(file);
      const res = await setMedia(post.slug, { videoUrl: url });
      if (!res.ok) throw new Error("Save failed");
      setVideoUrl(url);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploadingKind(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleVideoRemove = async () => {
    setUploadError(null);
    setUploadingKind("video");
    try {
      const res = await setMedia(post.slug, { videoUrl: null });
      if (!res.ok) throw new Error("Save failed");
      setVideoUrl(null);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploadingKind(null);
    }
  };

  const handleImagesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadingKind("image");
    try {
      // Upload sequentially so /api/upload's rate limit isn't tripped
      // by a 10-image carousel parallel-blast.
      const next = [...imageUrls];
      for (const file of Array.from(files)) {
        const url = await uploadOne(file);
        next.push(url);
        setImageUrls([...next]); // optimistic per-image render
      }
      const res = await setMedia(post.slug, { imageUrls: next });
      if (!res.ok) throw new Error("Save failed");
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploadingKind(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleImageRemove = async (idx: number) => {
    const next = imageUrls.filter((_, i) => i !== idx);
    setImageUrls(next);
    try {
      await setMedia(post.slug, { imageUrls: next });
    } catch (e) {
      setUploadError((e as Error).message);
    }
  };

  const togglePublish = () => {
    const next = !published;
    setStatus(null);
    startTransition(async () => {
      const res = await setPublished(post.slug, next);
      if (res.ok) {
        setPublishedState(next);
        setStatus(next ? "published" : "unpublished");
      } else {
        setStatus("failed");
      }
      setTimeout(() => setStatus(null), 1500);
    });
  };

  const save = (patch: Partial<{
    hook: string; script: string; caption: string; hashtags: string[]; keyword: string; body: string;
  }>) => {
    setStatus(null);
    startTransition(async () => {
      const res = await updatePost(post.slug, patch);
      setStatus(res.ok ? "saved" : "save failed");
      setTimeout(() => setStatus(null), 1500);
    });
  };

  const saveHashtags = () => {
    const arr = hashtagsRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("#") ? s : "#" + s));
    save({ hashtags: arr });
  };

  const copy = async (text: string) => {
    try {
      // Primary: modern Clipboard API (requires secure context + focus)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: textarea + execCommand for older browsers / edge cases
        fallbackCopy(text);
      }
      setStatus("copied ✓");
      setTimeout(() => setStatus(null), 1200);
    } catch {
      // Clipboard API can throw even in secure context (permission denied,
      // document not focused). Fall back to the textarea method.
      try {
        fallbackCopy(text);
        setStatus("copied ✓");
        setTimeout(() => setStatus(null), 1200);
      } catch {
        setStatus("copy failed — select & Ctrl+C");
        setTimeout(() => setStatus(null), 3000);
      }
    }
  };

  /** Fallback copy using a hidden textarea + document.execCommand. Works in
   *  cases where the Clipboard API throws (permission, focus, iframe). */
  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  if (!g) {
    return (
      <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-200">
        Content for this guide hasn&apos;t been generated yet. Run{" "}
        <code>python generate_post_content.py --slug {post.slug}</code> in{" "}
        <code>C:\Users\serka\Fadia voice\</code>.
      </div>
    );
  }

  // Your own deployed /guides/<slug> page — this is what ManyChat sends
  // to people who comment the trigger keyword. Hosted on the same domain
  // as the dashboard so we own the click + the read. NEXT_PUBLIC_APP_URL
  // is the canonical origin (set in Vercel + .env); fall back to the
  // current production deployment if it's missing in dev.
  const guideOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://creator-os-delta.vercel.app";
  const fadiaUrl = `${guideOrigin}/guides/${post.slug}`;

  // ManyChat reply uses a TEXT body + BUTTON. The text doesn't include
  // the URL — the URL lives behind a "Get Free Guide" button so the DM
  // reads as a friendly note, not a raw link drop. The 🤩 (star-struck)
  // emoji is the "super stare" face the brand voice uses.
  const dmText =
    `Here it is! Hope it's SUPER helpful 🤩\n\n` +
    `If you have any questions, just let me know.`;
  const dmButtonLabel = "Get Free Guide";

  // Prefill /compose with the caption + hashtags
  const composeUrl =
    "/compose?prefillCaption=" +
    encodeURIComponent(caption + "\n\n" + hashtagsRaw);

  return (
    <div className="mt-6 space-y-6">
      {/* Status pill + Publish toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <span>Generated by {post.model ?? "?"}</span>
          {post.generated_at && (
            <span>· {post.generated_at.slice(0, 10)}</span>
          )}
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] uppercase font-semibold ${
              published
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
            }`}
          >
            {published ? "live on /guides" : "draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className="text-xs text-emerald-300">{status}</span>
          )}
          {published && (
            <a
              href={`/guides/${post.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 text-xs hover:bg-emerald-500/20"
            >
              View public ↗
            </a>
          )}
          <button
            type="button"
            onClick={togglePublish}
            disabled={isPending}
            className={`rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              published
                ? "border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]"
                : "bg-[var(--color-text)] text-[var(--color-text-on-dark)] hover:opacity-90"
            }`}
          >
            {published ? "Unpublish" : "Publish to /guides"}
          </button>
        </div>
      </div>

      {/* ManyChat wiring kit — everything needed to configure ManyChat
          for this guide in one place. Trigger keyword + DM reply URL +
          a ready-to-paste DM template. The primary "Copy ManyChat reply"
          button copies the full DM text so the admin pastes it straight
          into ManyChat's keyword-reply field. */}
      <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="font-display text-xl">
            ManyChat <span className="font-italic-accent text-blush">wiring.</span>
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            keyword → DM with link → guide page
          </span>
        </div>

        {/* 1. Trigger keyword */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">
            1. Trigger keyword
            <span className="text-[10px] text-[var(--color-muted)] ml-2 font-normal">
              what users comment under your Reel
            </span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value.toUpperCase())}
              onBlur={() => save({ keyword })}
              className="flex-1 max-w-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base font-mono uppercase"
            />
            <button
              type="button"
              onClick={() => copy(keyword)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]"
            >
              Copy keyword
            </button>
          </div>
        </div>

        {/* 2. DM text — no URL, friendly note that precedes the button */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">
            2. DM text (paste into ManyChat message)
            <span className="text-[10px] text-[var(--color-muted)] ml-2 font-normal">
              what they see — the URL is hidden behind the button below
            </span>
          </label>
          <textarea
            value={dmText}
            readOnly
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            rows={3}
            className="w-full rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-mono leading-relaxed"
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={() => copy(dmText)}
              className="rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500/30"
            >
              Copy DM text
            </button>
          </div>
        </div>

        {/* 3. Button label */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">
            3. Button label
            <span className="text-[10px] text-[var(--color-muted)] ml-2 font-normal">
              the text on the ManyChat button under the DM
            </span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              value={dmButtonLabel}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 max-w-xs rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm font-semibold"
            />
            <button
              type="button"
              onClick={() => copy(dmButtonLabel)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]"
            >
              Copy label
            </button>
          </div>
        </div>

        {/* 4. Button URL — the link itself, hidden behind the button */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">
            4. Button URL
            <span className="text-[10px] text-[var(--color-muted)] ml-2 font-normal">
              where the button takes them — they never see this URL
            </span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              value={fadiaUrl}
              readOnly
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => copy(fadiaUrl)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs hover:bg-[var(--color-surface-hover)]"
            >
              Copy URL
            </button>
            <a
              href={fadiaUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-xs hover:bg-emerald-500/20"
            >
              Preview ↗
            </a>
          </div>
        </div>

        {/* ManyChat setup hint — explains the assembly without becoming
            a wall of text. The keyword name is interpolated so the
            instruction reads as concrete for this guide. */}
        <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-[var(--color-muted)] leading-relaxed">
          <strong className="text-[var(--color-text)]">In ManyChat:</strong>{" "}
          New Growth Tool → Comment-to-DM → trigger ={" "}
          <code className="font-mono">{keyword || "(set keyword above)"}</code>.
          Set the DM message text from step 2, then add a Button (type: URL)
          with the label from step 3 and the URL from step 4. The recipient
          sees a friendly note and a "{dmButtonLabel}" button — never the raw link.
        </div>
      </div>

      {/* Hook — with a "Rate this post" button that scores virality
          and offers 3 rewrites. */}
      <Section label="Hook" hint="First 1-2 sentences on camera">
        <textarea
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          onBlur={() => save({ hook })}
          rows={3}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-1.5 flex gap-2 flex-wrap items-center">
          <button
            type="button"
            onClick={() => copy(hook)}
            className="text-[11px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-surface-hover)]"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={runRateHook}
            disabled={isRating || !hook.trim()}
            className="text-[11px] rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 px-2 py-1 font-semibold hover:bg-purple-500/30 disabled:opacity-50"
          >
            {isRating ? "Rating…" : "Rate this post"}
          </button>
          <span className="text-[10px] text-[var(--color-muted)] self-center">
            edits auto-save on blur
          </span>
        </div>

        {ratingError && (
          <div className="mt-3 rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            {ratingError}
          </div>
        )}

        {hookRating && (
          <HookRatingPanel
            rating={hookRating}
            onUseRewrite={useRewrite}
            onCopy={copy}
            onDismiss={() => setHookRating(null)}
          />
        )}
      </Section>

      {/* Talking-head script */}
      <Section label="Talking-head script" hint="60-90 seconds, paste into a teleprompter">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          onBlur={() => save({ script })}
          rows={14}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed font-mono"
        />
        <CopyScriptBar script={script} hook={hook} onCopy={copy} />
      </Section>

      {/* Long-form article body — the "full guide" shown on /guides/<slug>.
          Empty by default; the admin pastes/writes a fuller piece of prose
          here when they want the public page to read as a real article
          (not just hook + script). Blank lines render as paragraph breaks
          on the public page. */}
      <Section
        label="Full guide body"
        hint="Long-form article shown on the public /guides page. Blank line = new paragraph."
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => save({ body })}
          rows={18}
          placeholder="Write or paste the full guide here. This is what visitors read on the public /guides/<slug> page. Leave empty if you only want hook + script + caption on the page."
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed"
        />
        <div className="mt-1.5 flex gap-2 items-center">
          <button
            type="button"
            onClick={() => copy(body)}
            className="text-[11px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-surface-hover)]"
          >
            Copy
          </button>
          <span className="text-[10px] text-[var(--color-muted)]">
            {body.trim().split(/\s+/).filter(Boolean).length} words · auto-saves on blur
          </span>
          {published && body.trim() && (
            <a
              href={`/guides/${post.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--color-blush-deep)] hover:underline ml-auto"
            >
              Preview public page ↗
            </a>
          )}
        </div>
      </Section>

      {/* Caption */}
      <Section label="Instagram caption" hint="150-200 words, ends with the keyword CTA">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => save({ caption })}
          rows={8}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm leading-relaxed"
        />
        <ActionBar onCopy={() => copy(caption)} />
      </Section>

      {/* Hashtags */}
      <Section label="Hashtags" hint="Space or comma separated">
        <textarea
          value={hashtagsRaw}
          onChange={(e) => setHashtagsRaw(e.target.value)}
          onBlur={saveHashtags}
          rows={3}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono"
        />
        <ActionBar onCopy={() => copy(hashtagsRaw)} />
      </Section>

      {/* AI video-prompt brief — interactive: hit Generate to build a
          SCENES + VOICEOVER + CAPTIONS production brief from the guide's
          hook + script + body + caption. Editable after generation;
          edits auto-save on blur. */}
      <Section
        label="AI video prompt"
        hint="Generate a Sora / Veo / Runway brief from this guide's content"
      >
        {promptError && (
          <div className="mb-2 rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            {promptError}
          </div>
        )}
        <div className="mb-2 flex gap-2 flex-wrap items-center">
          <button
            type="button"
            onClick={runGeneratePrompt}
            disabled={isGeneratingPrompt}
            className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {isGeneratingPrompt
              ? "Generating…"
              : videoPrompt
              ? "Regenerate with AI"
              : "Generate with AI"}
          </button>
          {videoPrompt && (
            <button
              type="button"
              onClick={() => copy(videoPrompt)}
              className="text-[11px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-surface-hover)]"
            >
              Copy brief
            </button>
          )}
          <span className="text-[10px] text-[var(--color-muted)]">
            Paste output into Sora / Veo / Runway / Pika · 4 scenes × 3s · 9:16 vertical
          </span>
        </div>
        <textarea
          value={videoPrompt}
          onChange={(e) => setVideoPromptText(e.target.value)}
          onBlur={() => persistVideoPrompt(videoPrompt)}
          rows={20}
          placeholder="Click 'Generate with AI' above to build a SCENES + VOICEOVER + CAPTIONS brief from your hook + script + caption. Then edit anything you want before pasting into your video generator."
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs leading-relaxed font-mono"
        />
        {videoPrompt && (
          <div className="mt-1 text-[10px] text-[var(--color-muted)]">
            {videoPrompt.split(/\s+/).filter(Boolean).length} words · edits auto-save on blur
          </div>
        )}
      </Section>

      {/* HeyGen avatar generator — pick an avatar + voice you've
          already trained on heygen.com, hit Generate, and the resulting
          9:16 MP4 lands automatically in the talking-head video tile
          below. Uses the existing async studio pipeline so the long
          (~3-5 min) render doesn't block this page. */}
      <Section
        label="HeyGen avatar video"
        hint="Render the talking-head clip from your trained HeyGen avatar"
      >
        {heygenError && (
          <div className="mb-2 rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            {heygenError}
          </div>
        )}
        {heygenAvatars.length === 0 && !heygenError ? (
          <div className="rounded border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-muted)]">
            Loading your HeyGen avatars… If this stays empty, check that
            HEYGEN_API_KEY is set in your Vercel env vars and that you've
            trained at least one Photo Avatar on heygen.com.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Avatar picker */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-1">
                  Avatar (your trained photo avatars)
                </label>
                <select
                  value={heygenAvatarId}
                  onChange={(e) => setHeygenAvatarId(e.target.value)}
                  disabled={heygenLoading}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">— Pick an avatar —</option>
                  {heygenAvatars.map((a) => (
                    <option key={a.avatar_id} value={a.avatar_id}>
                      {a.avatar_name}
                    </option>
                  ))}
                </select>
              </div>
              {/* Voice picker */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-1">
                  Voice
                </label>
                <select
                  value={heygenVoiceId}
                  onChange={(e) => setHeygenVoiceId(e.target.value)}
                  disabled={heygenLoading}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="">— Pick a voice —</option>
                  {heygenVoices
                    .filter((v) => v.language.toLowerCase().startsWith("en"))
                    .map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name} · {v.gender} · {v.language}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={runHeyGenGenerate}
                disabled={heygenLoading || !script.trim() || !heygenAvatarId || !heygenVoiceId}
                className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {heygenLoading ? "Generating…" : "Generate talking-head with HeyGen"}
              </button>
              {heygenStatus && (
                <span className="text-xs text-[var(--color-muted)]">
                  {heygenStatus}
                </span>
              )}
              <span className="text-[10px] text-[var(--color-muted)] ml-auto">
                Selection saved for next guide · uses the Talking-head script above as the voiceover
              </span>
            </div>
          </div>
        )}
      </Section>

      {/* Media uploads — talking-head video + carousel images. Both
          upload to R2 via /api/upload and the URL gets saved to
          DailyGuide.videoUrl / .imageUrls. */}
      <Section
        label="Talking-head post & images"
        hint="Upload the recorded Reel and/or carousel images for this guide"
      >
        {uploadError && (
          <div className="mb-3 rounded border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            Upload error: {uploadError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Talking-head video */}
          <div>
            <div className="text-xs font-semibold mb-1.5">Talking-head video</div>
            {videoUrl ? (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded aspect-[9/16] object-cover bg-black"
                />
                <div className="mt-2 flex gap-2 items-center">
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] underline text-[var(--color-muted)] truncate"
                  >
                    {videoUrl.split("/").pop()}
                  </a>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={handleVideoRemove}
                    disabled={uploadingKind === "video"}
                    className="text-[11px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={
                  "block cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition select-none " +
                  (videoDragOver
                    ? "border-emerald-400 bg-emerald-50/10"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text)]/30")
                }
                onClick={() => videoInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") videoInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setVideoDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith("video/")) {
                    handleVideoSelected(file);
                  } else if (file) {
                    setUploadError("Please drop a video file (MP4, MOV)");
                  }
                }}
              >
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => handleVideoSelected(e.target.files?.[0] ?? null)}
                  disabled={uploadingKind === "video"}
                />
                <div className="text-sm text-[var(--color-muted)]">
                  {uploadingKind === "video"
                    ? "Uploading…"
                    : videoDragOver
                    ? "Drop video here"
                    : "Click or drag video here"}
                </div>
                <div className="text-xs text-[var(--color-muted)] mt-1">
                  MP4 / MOV · max 200 MB
                </div>
              </div>
            )}
          </div>

          {/* Carousel images */}
          <div>
            <div className="text-xs font-semibold mb-1.5">
              Carousel images{" "}
              <span className="font-normal text-[var(--color-muted)]">
                ({imageUrls.length})
              </span>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-3">
              {imageUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {imageUrls.map((url, i) => (
                    <div key={url + i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Carousel ${i + 1}`}
                        className="w-full aspect-square object-cover rounded border border-[var(--color-border)]"
                      />
                      <button
                        type="button"
                        onClick={() => handleImageRemove(i)}
                        className="absolute top-1 right-1 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition"
                        title="Remove image"
                      >
                        ✕
                      </button>
                      <div className="absolute bottom-1 left-1 rounded bg-black/60 text-white text-[10px] px-1.5 py-0.5">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                role="button"
                tabIndex={0}
                className={
                  "block cursor-pointer rounded border-2 border-dashed py-4 text-center transition select-none " +
                  (imageDragOver
                    ? "border-emerald-400 bg-emerald-50/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-text)]/30")
                }
                onClick={() => imageInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") imageInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDragOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDragOver(false);
                  const files = e.dataTransfer.files;
                  if (files?.length) {
                    const imageFiles = Array.from(files).filter((f) =>
                      f.type.startsWith("image/"),
                    );
                    if (imageFiles.length > 0) {
                      const dt = new DataTransfer();
                      imageFiles.forEach((f) => dt.items.add(f));
                      handleImagesSelected(dt.files);
                    } else {
                      setUploadError("Please drop image files (JPEG, PNG, WebP)");
                    }
                  }
                }}
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleImagesSelected(e.target.files)}
                  disabled={uploadingKind === "image"}
                />
                <div className="text-xs text-[var(--color-muted)]">
                  {uploadingKind === "image"
                    ? "Uploading…"
                    : imageDragOver
                    ? "Drop images here"
                    : imageUrls.length === 0
                    ? "Click or drag images here"
                    : "Add more (click or drag)"}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">
                  JPEG / PNG / WebP · max 200 MB each
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Publish to social platforms — with full preview */}
      <div className="mt-8 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display text-xl">
            Publish to <span className="font-italic-accent text-blush">socials.</span>
          </h3>
          <a
            href={composeUrl}
            className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
          >
            or open Compose →
          </a>
        </div>

        {/* Post preview — shows exactly what will be published */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold">
            Post preview
          </div>

          {/* Media preview */}
          <div className="flex gap-3 items-start">
            {videoUrl ? (
              <video
                src={videoUrl}
                className="w-28 h-28 rounded-lg object-cover bg-black flex-shrink-0"
                muted
              />
            ) : imageUrls.length > 0 ? (
              <div className="flex gap-1.5 flex-shrink-0">
                {imageUrls.slice(0, 3).map((url, i) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={url + i}
                    src={url}
                    alt={`Image ${i + 1}`}
                    className="w-28 h-28 rounded-lg object-cover border border-[var(--color-border)]"
                  />
                ))}
                {imageUrls.length > 3 && (
                  <div className="w-28 h-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-xs text-[var(--color-muted)]">
                    +{imageUrls.length - 3} more
                  </div>
                )}
              </div>
            ) : (
              <div className="w-28 h-28 rounded-lg border-2 border-dashed border-amber-500/30 bg-amber-500/5 flex items-center justify-center text-xs text-amber-300 flex-shrink-0">
                No media
              </div>
            )}

            {/* Caption preview */}
            <div className="flex-1 min-w-0">
              <div className="text-sm leading-relaxed line-clamp-5 whitespace-pre-wrap">
                {caption.trim() || <span className="text-amber-300 italic">No caption</span>}
              </div>
              {hashtagsRaw.trim() && (
                <div className="mt-1.5 text-xs text-[var(--color-muted)] leading-relaxed line-clamp-2">
                  {hashtagsRaw}
                </div>
              )}
            </div>
          </div>

          {/* CTA check — warn if the keyword CTA line is missing from the caption */}
          {keyword.trim() && !caption.toLowerCase().includes(`comment ${keyword.toLowerCase()}`) && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 leading-relaxed">
              <strong>Missing CTA:</strong> Your caption doesn&apos;t include{" "}
              <code className="font-mono bg-amber-500/10 px-1 rounded">Comment {keyword} for the full guide</code>.
              Add it to the end of your caption so ManyChat picks up the trigger.
            </div>
          )}

          {/* Quick summary chips */}
          <div className="flex gap-2 flex-wrap text-[10px] text-[var(--color-muted)]">
            <span className="rounded bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5">
              {videoUrl ? "Video (Reel)" : imageUrls.length > 0 ? `${imageUrls.length} image${imageUrls.length !== 1 ? "s" : ""}` : "No media"}
            </span>
            <span className="rounded bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5">
              {caption.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            {hashtagsRaw.trim() && (
              <span className="rounded bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5">
                {hashtagsRaw.trim().split(/[\s,]+/).filter(Boolean).length} hashtags
              </span>
            )}
            {keyword.trim() && caption.toLowerCase().includes(`comment ${keyword.toLowerCase()}`) && (
              <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-emerald-300">
                CTA: Comment {keyword}
              </span>
            )}
            {hook.trim() && (
              <span className="rounded bg-[var(--color-surface)] border border-[var(--color-border)] px-2 py-0.5">
                Hook set
              </span>
            )}
          </div>
        </div>

        {/* Platform toggles */}
        <div className="flex gap-2 flex-wrap">
          {AVAILABLE_PLATFORMS.map((p) => {
            const active = selectedPlatforms.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => togglePlatform(p.key)}
                disabled={isPublishing}
                className={
                  "rounded-full px-4 py-1.5 text-xs font-semibold border transition disabled:opacity-50 " +
                  (active
                    ? "text-white border-transparent"
                    : "text-[var(--color-muted)] border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text)]/30")
                }
                style={active ? { backgroundColor: p.color } : undefined}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Account health status */}
        {accountHealth && accountHealth.length > 0 && (
          <div className="flex gap-2 flex-wrap text-[11px]">
            {accountHealth.map((a) => (
              <span
                key={a.platform}
                className={
                  "rounded border px-2 py-1 " +
                  (a.ok
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                    : "border-red-500/30 bg-red-500/5 text-red-300")
                }
                title={a.detail + (a.scopes?.length ? `\nScopes: ${a.scopes.join(", ")}` : "")}
              >
                {a.ok ? "✓" : "✗"} {a.platform}
                {!a.ok && (
                  <span className="ml-1 opacity-70">
                    — {a.detail.length > 40 ? a.detail.slice(0, 40) + "…" : a.detail}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Publish button + warnings */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={runPublishToSocial}
            disabled={isPublishing || selectedPlatforms.length === 0 || !caption.trim()}
            className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {isPublishing ? "Publishing…" : `Publish to ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? "s" : ""}`}
          </button>
          {!caption.trim() && (
            <span className="text-xs text-amber-300">Caption is empty</span>
          )}
          {!videoUrl && imageUrls.length === 0 && (
            <span className="text-xs text-amber-300">No media uploaded — text-only post</span>
          )}
        </div>

        {publishError && (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-300">
            {publishError}
          </div>
        )}

        {publishResults && (
          <div className="space-y-1.5">
            {publishResults.map((r) => (
              <div
                key={r.platform}
                className={
                  "flex items-center gap-2 rounded border px-3 py-2 text-xs " +
                  (r.ok
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                    : "border-red-500/30 bg-red-500/5 text-red-300")
                }
              >
                <span className="font-semibold">
                  {r.ok ? "✓" : "✕"} {r.platform}
                </span>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline ml-auto"
                  >
                    View post ↗
                  </a>
                )}
                {r.error && (
                  <span className="ml-auto truncate max-w-xs">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isPending && (
        <div className="fixed bottom-4 left-4 rounded bg-black/60 text-white text-xs px-3 py-1.5">
          Saving…
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        {hint && <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Inline panel that renders the AI hook rating + 3 rewrite suggestions.
 *  Sits under the Hook textarea after "Rate this post" returns. */
function HookRatingPanel({
  rating,
  onUseRewrite,
  onCopy,
  onDismiss,
}: {
  rating: HookRating;
  onUseRewrite: (text: string) => void;
  onCopy: (text: string) => void;
  onDismiss: () => void;
}) {
  // Color the headline score by tier — green ≥8, yellow 6-7, red <6.
  const scoreColor =
    rating.overallScore >= 8
      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
      : rating.overallScore >= 6
      ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
      : "text-red-300 bg-red-500/10 border-red-500/30";

  const dims = [
    { label: "Curiosity gap", value: rating.scores.curiosityGap },
    { label: "Specificity", value: rating.scores.specificity },
    { label: "Pattern interrupt", value: rating.scores.patternInterrupt },
    { label: "Clarity", value: rating.scores.clarity },
    { label: "Relevance", value: rating.scores.relevance },
  ];

  return (
    <div className="mt-4 rounded-xl border-2 border-purple-500/30 bg-purple-500/5 p-4 space-y-4">
      {/* Header with score + dismiss */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`rounded-lg border-2 px-3 py-1.5 text-2xl font-bold leading-none ${scoreColor}`}
          >
            {rating.overallScore}<span className="text-sm opacity-60">/10</span>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold">
              Virality score
            </div>
            <div className="text-sm mt-0.5">{rating.verdict}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-2"
          title="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Per-dimension scores */}
      <div className="grid grid-cols-5 gap-2">
        {dims.map((d) => (
          <div key={d.label} className="text-center">
            <div
              className={`text-base font-bold ${
                d.value >= 8 ? "text-emerald-300" : d.value >= 6 ? "text-amber-300" : "text-red-300"
              }`}
            >
              {d.value}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-[var(--color-muted)] leading-tight mt-0.5">
              {d.label}
            </div>
          </div>
        ))}
      </div>

      {/* Strengths + weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        {rating.strengths.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-semibold mb-1">
              ✓ Working
            </div>
            <ul className="space-y-1 list-disc list-inside text-[var(--color-text)]">
              {rating.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {rating.weaknesses.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1">
              ✗ Could be stronger
            </div>
            <ul className="space-y-1 list-disc list-inside text-[var(--color-text)]">
              {rating.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3 rewrites with one-click Use button */}
      {rating.rewrites.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold mb-2">
            Try one of these
          </div>
          <div className="space-y-2">
            {rating.rewrites.map((r, i) => (
              <div
                key={i}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="text-sm leading-relaxed mb-2">{r}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onUseRewrite(r)}
                    className="rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 px-3 py-1 text-xs font-semibold hover:bg-purple-500/30"
                  >
                    Use this hook
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy(r)}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs hover:bg-[var(--color-surface-hover)]"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBar({ onCopy }: { onCopy: () => void }) {
  return (
    <div className="mt-1.5 flex gap-2">
      <button
        type="button"
        onClick={onCopy}
        className="text-[11px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-surface-hover)]"
      >
        Copy
      </button>
      <span className="text-[10px] text-[var(--color-muted)] self-center">
        edits auto-save on blur
      </span>
    </div>
  );
}

/** Prominent copy bar for the talking-head script section.
 *  Three buttons with inline ✓ feedback — no need to look at the page header. */
function CopyScriptBar({
  script,
  hook,
  onCopy,
}: {
  script: string;
  hook: string;
  onCopy: (text: string) => void;
}) {
  const [copied, setCopied] = useState<null | "script" | "hook" | "both">(null);

  const doCopy = async (kind: "script" | "hook" | "both") => {
    let text = "";
    if (kind === "script") text = script;
    else if (kind === "hook") text = hook;
    else text = `${hook}\n\n${script}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fbCopy(text);
      }
      setCopied(kind);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      try {
        fbCopy(text);
        setCopied(kind);
        setTimeout(() => setCopied(null), 1400);
      } catch {
        setCopied(null);
      }
    }
  };

  /** Fallback copy for environments where Clipboard API throws */
  function fbCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  const estSec = Math.round((wordCount / 150) * 60);

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => doCopy("script")}
        className="rounded bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-1.5 text-xs font-semibold hover:opacity-90"
      >
        {copied === "script" ? "✓ Copied" : "Copy script"}
      </button>
      {hook.trim() && (
        <button
          type="button"
          onClick={() => doCopy("hook")}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]"
        >
          {copied === "hook" ? "✓ Copied" : "Copy hook only"}
        </button>
      )}
      {hook.trim() && (
        <button
          type="button"
          onClick={() => doCopy("both")}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)]"
        >
          {copied === "both" ? "✓ Copied" : "Hook + script"}
        </button>
      )}
      <span className="text-[10px] text-[var(--color-muted)] self-center ml-auto">
        {wordCount} words · ~{estSec}s · auto-saves on blur
      </span>
    </div>
  );
}
