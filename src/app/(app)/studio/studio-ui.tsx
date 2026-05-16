"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ImageIcon,
  Film,
  Library,
  Loader2,
  Sparkles,
  Trash2,
  Send,
  Copy,
  Check,
  AlertTriangle,
  UserCircle2,
  Palette,
} from "lucide-react";
import {
  createImage,
  createVideo,
  createAvatarVideo,
  createOpenartGen,
  getOpenartStatus,
  pollAsset,
  listAssets,
  deleteAsset,
  useInDraft,
  listHeygenAvatars,
  listHeygenVoices,
  type StudioAsset,
} from "./actions";
import type { HeygenAvatar, HeygenVoice } from "@/lib/ai/heygen";
import type { OpenartModel, OpenartAspect } from "@/lib/ai/openart";

type Tab = "image" | "video" | "avatar" | "openart" | "library";

/**
 * Poll a placeholder asset until its status flips to READY or FAILED.
 * Used by Video + Avatar tabs since those generations run async server-side.
 */
async function pollUntilReady(
  id: string,
  opts: { intervalMs?: number; timeoutMs?: number; onTick?: (a: StudioAsset) => void } = {},
): Promise<StudioAsset> {
  const interval = opts.intervalMs ?? 4000;
  const deadline = Date.now() + (opts.timeoutMs ?? 8 * 60 * 1000);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      throw new Error("Generation timed out. It may still finish — check the Library tab.");
    }
    const a = await pollAsset(id);
    if (!a) throw new Error("Asset disappeared.");
    opts.onTick?.(a);
    if (a.status === "READY") return a;
    if (a.status === "FAILED") {
      throw new Error(a.error || "Generation failed.");
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export function StudioUI() {
  const [tab, setTab] = useState<Tab>("image");

  return (
    <div>
      <div className="border-b border-[var(--color-border)] mb-6 flex flex-wrap gap-1">
        <TabButton id="image" current={tab} onClick={() => setTab("image")} icon={ImageIcon}>
          Image
        </TabButton>
        <TabButton id="video" current={tab} onClick={() => setTab("video")} icon={Film}>
          Video
        </TabButton>
        <TabButton id="avatar" current={tab} onClick={() => setTab("avatar")} icon={UserCircle2}>
          Avatar
        </TabButton>
        <TabButton id="openart" current={tab} onClick={() => setTab("openart")} icon={Palette}>
          OpenArt
        </TabButton>
        <TabButton id="library" current={tab} onClick={() => setTab("library")} icon={Library}>
          Library
        </TabButton>
      </div>

      {tab === "image" && <ImageTab />}
      {tab === "video" && <VideoTab />}
      {tab === "avatar" && <AvatarTab />}
      {tab === "openart" && <OpenartTab />}
      {tab === "library" && <LibraryTab />}
    </div>
  );
}

function TabButton({
  id,
  current,
  onClick,
  icon: Icon,
  children,
}: {
  id: Tab;
  current: Tab;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const active = id === current;
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-2 text-sm flex items-center gap-2 border-b-2 -mb-px transition " +
        (active
          ? "border-[var(--color-accent)] text-[var(--color-text)]"
          : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]")
      }
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

// ─── IMAGE TAB ──────────────────────────────────────────────────

const IMAGE_SIZES: { id: "1024x1024" | "1024x1536" | "1536x1024"; label: string; ratio: string }[] = [
  { id: "1024x1024", label: "Square (1:1)", ratio: "Feed posts" },
  { id: "1024x1536", label: "Portrait (2:3)", ratio: "Reels / Stories" },
  { id: "1536x1024", label: "Landscape (3:2)", ratio: "YouTube thumbs" },
];

function ImageTab() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">(
    "1024x1024",
  );
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StudioAsset | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function go() {
    if (!prompt.trim()) {
      setErr("Type a prompt first.");
      return;
    }
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        const asset = await createImage({ prompt, size, quality });
        setResult(asset);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 space-y-4">
        <Field label="Prompt">
          <textarea
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm min-h-[160px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="e.g. A flat-lay of a journal, latte, and dried flowers on a warm cream linen — soft morning light, shot from above, muted earth tones"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>

        <Field label="Aspect">
          <div className="grid grid-cols-3 gap-2">
            {IMAGE_SIZES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={
                  "border rounded-lg px-2 py-2 text-xs text-left transition " +
                  (size === s.id
                    ? "bg-[var(--color-surface-2)] border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]")
                }
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.ratio}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Quality">
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={
                  "px-3 py-1.5 rounded-full text-xs capitalize " +
                  (quality === q
                    ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                }
              >
                {q}
              </button>
            ))}
          </div>
        </Field>

        <button
          onClick={go}
          disabled={pending}
          className="w-full bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating… (~10s)
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate image
            </>
          )}
        </button>

        {err && <ErrorBox message={err} />}
        <CostNote text="~$0.04 square / ~$0.07 portrait or landscape · billed to your OpenAI API account" />
      </section>

      <section className="lg:col-span-3">
        <PreviewPanel asset={result} pending={pending} kind="image" />
      </section>
    </div>
  );
}

// ─── VIDEO TAB ──────────────────────────────────────────────────

const VIDEO_SIZES: { id: "720x1280" | "1280x720" | "1024x1024"; label: string; ratio: string }[] = [
  { id: "720x1280", label: "Vertical (9:16)", ratio: "Reels / TikTok / Shorts" },
  { id: "1280x720", label: "Horizontal (16:9)", ratio: "YouTube" },
  { id: "1024x1024", label: "Square (1:1)", ratio: "Feed" },
];

function VideoTab() {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"720x1280" | "1280x720" | "1024x1024">("720x1280");
  const [seconds, setSeconds] = useState<"4" | "8" | "12">("4");
  const [model, setModel] = useState<"sora-2" | "sora-2-pro">("sora-2");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StudioAsset | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function go() {
    if (!prompt.trim()) {
      setErr("Type a prompt first.");
      return;
    }
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        const placeholder = await createVideo({ prompt, size, seconds, model });
        setResult(placeholder); // show GENERATING state immediately
        const ready = await pollUntilReady(placeholder.id, {
          onTick: (a) => setResult(a),
        });
        setResult(ready);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const costEst = (model === "sora-2-pro" ? 0.3 : 0.1) * parseInt(seconds, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 space-y-4">
        <Field label="Prompt">
          <textarea
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm min-h-[160px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="e.g. Slow cinematic dolly-in on a steaming espresso cup on a wooden table, morning light streaming through cafe windows, 35mm film grain"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>

        <Field label="Aspect">
          <div className="grid grid-cols-3 gap-2">
            {VIDEO_SIZES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={
                  "border rounded-lg px-2 py-2 text-xs text-left transition " +
                  (size === s.id
                    ? "bg-[var(--color-surface-2)] border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]")
                }
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.ratio}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Length">
          <div className="flex gap-2">
            {(["4", "8", "12"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeconds(s)}
                className={
                  "px-3 py-1.5 rounded-full text-xs " +
                  (seconds === s
                    ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                }
              >
                {s}s
              </button>
            ))}
          </div>
        </Field>

        <Field label="Model">
          <div className="flex gap-2">
            {(["sora-2", "sora-2-pro"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={
                  "px-3 py-1.5 rounded-full text-xs " +
                  (model === m
                    ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                }
              >
                {m === "sora-2-pro" ? "Pro (sharper)" : "Standard"}
              </button>
            ))}
          </div>
        </Field>

        <button
          onClick={go}
          disabled={pending}
          className="w-full bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Rendering… (1-3 min, hang tight)
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate video
            </>
          )}
        </button>

        {err && <ErrorBox message={err} />}
        <CostNote
          text={`~$${costEst.toFixed(2)} for this clip · billed to your OpenAI API account`}
        />
        <div className="text-[11px] text-[var(--color-muted)] leading-relaxed">
          <strong>Heads up:</strong> Sora 2 API requires org-level access on OpenAI. If you
          see a <code>model_not_found</code> error, request access at{" "}
          <a
            href="https://platform.openai.com/docs/guides/video"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            platform.openai.com
          </a>
          .
        </div>
      </section>

      <section className="lg:col-span-3">
        <PreviewPanel asset={result} pending={pending} kind="video" />
      </section>
    </div>
  );
}

// ─── AVATAR TAB (HeyGen) ────────────────────────────────────

const AVATAR_ASPECTS: { id: "9:16" | "16:9" | "1:1"; label: string; ratio: string }[] = [
  { id: "9:16", label: "Vertical (9:16)", ratio: "Reels / TikTok / Shorts" },
  { id: "16:9", label: "Horizontal (16:9)", ratio: "YouTube" },
  { id: "1:1", label: "Square (1:1)", ratio: "Feed" },
];

function AvatarTab() {
  const [script, setScript] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [avatars, setAvatars] = useState<HeygenAvatar[] | null>(null);
  const [voices, setVoices] = useState<HeygenVoice[] | null>(null);
  const [avatarId, setAvatarId] = useState<string>("");
  const [voiceId, setVoiceId] = useState<string>("");
  const [voiceFilter, setVoiceFilter] = useState<string>("en");
  const [pending, start] = useTransition();
  const [loadingLists, setLoadingLists] = useState(true);
  const [listErr, setListErr] = useState<string | null>(null);
  const [result, setResult] = useState<StudioAsset | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingLists(true);
    Promise.all([listHeygenAvatars(), listHeygenVoices()])
      .then(([a, v]) => {
        if (cancelled) return;
        setAvatars(a);
        setVoices(v);
        if (a.length && !avatarId) setAvatarId(a[0].avatar_id);
        const eng = v.find((x) => x.language?.toLowerCase().startsWith("en"));
        if (eng && !voiceId) setVoiceId(eng.voice_id);
      })
      .catch((e) => {
        if (cancelled) return;
        setListErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoadingLists(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go() {
    if (!script.trim()) {
      setErr("Type a script first.");
      return;
    }
    if (!avatarId || !voiceId) {
      setErr("Pick an avatar and a voice.");
      return;
    }
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        const placeholder = await createAvatarVideo({ script, avatarId, voiceId, aspect });
        setResult(placeholder);
        const ready = await pollUntilReady(placeholder.id, {
          onTick: (a) => setResult(a),
        });
        setResult(ready);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const filteredVoices = voices
    ? voiceFilter === "all"
      ? voices
      : voices.filter((v) =>
          v.language?.toLowerCase().startsWith(voiceFilter.toLowerCase()),
        )
    : [];

  if (listErr) {
    return (
      <div className="space-y-4">
        <ErrorBox message={listErr} />
        <div className="text-xs text-[var(--color-muted)] leading-relaxed">
          To use Avatar mode, sign in at{" "}
          <a
            href="https://app.heygen.com/settings/api"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            app.heygen.com → API
          </a>
          , generate a token, then add <code>HEYGEN_API_KEY=…</code> to{" "}
          <code>.env.local</code> and restart the dev server.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 space-y-4">
        <Field label="Script">
          <textarea
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm min-h-[160px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            placeholder="What should the avatar say? Keep it under 60 seconds for best results."
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <div className="text-[10px] text-[var(--color-muted)] mt-1">
            {script.length} chars · ~{Math.ceil(script.length / 15)}s spoken
          </div>
        </Field>

        <Field label="Avatar">
          {loadingLists ? (
            <div className="text-xs text-[var(--color-muted)] flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading avatars…
            </div>
          ) : avatars && avatars.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {avatars.slice(0, 24).map((a) => (
                <button
                  key={a.avatar_id}
                  onClick={() => setAvatarId(a.avatar_id)}
                  className={
                    "border rounded-lg overflow-hidden text-left transition " +
                    (avatarId === a.avatar_id
                      ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-muted)]")
                  }
                >
                  {a.preview_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.preview_image_url}
                      alt={a.avatar_name}
                      loading="lazy"
                      decoding="async"
                      width={200}
                      height={200}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-[var(--color-surface-2)] flex items-center justify-center">
                      <UserCircle2 className="w-6 h-6 text-[var(--color-muted)]" />
                    </div>
                  )}
                  <div className="text-[10px] p-1.5 text-[var(--color-muted)] truncate">
                    {a.avatar_name}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--color-muted)]">No avatars available.</div>
          )}
        </Field>

        <Field label="Voice">
          {loadingLists ? (
            <div className="text-xs text-[var(--color-muted)] flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading voices…
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {[
                  { id: "en", label: "English" },
                  { id: "es", label: "Spanish" },
                  { id: "fr", label: "French" },
                  { id: "ar", label: "Arabic" },
                  { id: "all", label: "All" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setVoiceFilter(f.id)}
                    className={
                      "px-2 py-1 rounded-full text-[10px] " +
                      (voiceFilter === f.id
                        ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                    }
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {filteredVoices.slice(0, 200).map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.name} — {v.gender} ({v.language})
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>

        <Field label="Aspect">
          <div className="grid grid-cols-3 gap-2">
            {AVATAR_ASPECTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setAspect(s.id)}
                className={
                  "border rounded-lg px-2 py-2 text-xs text-left transition " +
                  (aspect === s.id
                    ? "bg-[var(--color-surface-2)] border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]")
                }
              >
                <div className="font-medium">{s.label}</div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{s.ratio}</div>
              </button>
            ))}
          </div>
        </Field>

        <button
          onClick={go}
          disabled={pending || loadingLists}
          className="w-full bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Rendering avatar… (1-3 min)
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate avatar video
            </>
          )}
        </button>

        {err && <ErrorBox message={err} />}
        <CostNote text="Billed against your HeyGen plan · roughly $0.30/minute on Creator API" />
      </section>

      <section className="lg:col-span-3">
        <PreviewPanel asset={result} pending={pending} kind="video" />
      </section>
    </div>
  );
}

// ─── OPENART TAB (local Playwright) ─────────────────────────

const OPENART_VIDEO_MODELS: { id: OpenartModel; label: string; note: string }[] = [
  { id: "veo3",     label: "Veo 3",     note: "Google · cinematic" },
  { id: "sora-v2",  label: "Sora 2",    note: "OpenAI · realism" },
  { id: "kling",    label: "Kling",     note: "Smooth motion" },
  { id: "hailuo",   label: "Hailuo",    note: "Fast" },
  { id: "seedance", label: "Seedance",  note: "Stylized" },
  { id: "wan",      label: "Wan",       note: "Open source" },
];

const OPENART_IMAGE_MODELS: { id: OpenartModel; label: string; note: string }[] = [
  { id: "flux-pro",     label: "Flux Pro",     note: "Best general image" },
  { id: "flux-kontext", label: "Flux Kontext", note: "Image-to-image edit" },
  { id: "flux-dev",     label: "Flux Dev",     note: "Cheap baseline" },
  { id: "gpt-image",    label: "GPT Image",    note: "OpenAI gpt-image-1" },
  { id: "gemini",       label: "Gemini",       note: "Google · 2.0 Flash" },
  { id: "imagen-4",     label: "Imagen 4",     note: "Google · photorealistic" },
  { id: "sdxl",         label: "SDXL",         note: "Stable Diffusion XL" },
];

const OPENART_ASPECTS: { id: OpenartAspect; label: string }[] = [
  { id: "9:16", label: "Vertical 9:16" },
  { id: "16:9", label: "Horizontal 16:9" },
  { id: "1:1",  label: "Square 1:1" },
  { id: "4:5",  label: "Portrait 4:5" },
  { id: "3:4",  label: "Tall 3:4" },
];

function OpenartTab() {
  const [status, setStatus] = useState<{
    available: boolean;
    reason: string | null;
  } | null>(null);
  const [kind, setKind] = useState<"video" | "image">("video");
  const [model, setModel] = useState<OpenartModel>("veo3");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<OpenartAspect>("9:16");
  const [duration, setDuration] = useState<5 | 8 | 10>(5);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StudioAsset | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Probe availability on mount
  useEffect(() => {
    let cancelled = false;
    getOpenartStatus()
      .then((s) => {
        if (cancelled) return;
        setStatus({ available: s.available, reason: s.reason });
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus({ available: false, reason: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || `HTTP ${r.status}`);
      }
      const { url } = (await r.json()) as { url: string };
      setImageUrl(url);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function go() {
    if (!prompt.trim()) {
      setErr("Type a prompt first.");
      return;
    }
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        const placeholder = await createOpenartGen({
          prompt,
          model,
          aspect,
          durationSec: kind === "video" ? duration : undefined,
          imageUrl: imageUrl ?? undefined,
          characterId: characterId.trim() || undefined,
        });
        setResult(placeholder);
        const ready = await pollUntilReady(placeholder.id, {
          onTick: (a) => setResult(a),
          timeoutMs: 6 * 60 * 1000,
        });
        setResult(ready);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const models = kind === "video" ? OPENART_VIDEO_MODELS : OPENART_IMAGE_MODELS;
  const showImageInput = kind === "video"
    ? true   // i2v supported for all video models via --image
    : model === "flux-kontext"; // image edit mode

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="lg:col-span-2 space-y-4">
        {status === null ? (
          <div className="text-xs text-[var(--color-muted)] flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking OpenArt availability…
          </div>
        ) : !status.available ? (
          <ErrorBox
            message={
              (status.reason ?? "OpenArt is not available here.") +
              " (Runs only on the local dev machine where the Playwright profile lives.)"
            }
          />
        ) : null}

        <Field label="Kind">
          <div className="flex gap-2">
            {(["video", "image"] as const).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  // Reset model to first of the chosen kind
                  setModel(k === "video" ? "veo3" : "flux-pro");
                  setImageUrl(null);
                }}
                className={
                  "px-3 py-1.5 rounded-full text-xs capitalize " +
                  (kind === k
                    ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                }
              >
                {k}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Model">
          <div className="grid grid-cols-2 gap-2">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={
                  "border rounded-lg px-2 py-2 text-xs text-left transition " +
                  (model === m.id
                    ? "bg-[var(--color-surface-2)] border-[var(--color-accent)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]")
                }
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-[10px] text-[var(--color-muted)] mt-0.5">{m.note}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Prompt">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              kind === "video"
                ? "e.g. Slow cinematic dolly-in on a steaming espresso cup on a wooden table, morning light, 35mm grain"
                : "e.g. A flat-lay of a journal and a latte on warm cream linen, soft morning light, top-down"
            }
            aria-label="OpenArt prompt"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
        </Field>

        <Field label="Aspect">
          <div className="flex flex-wrap gap-1.5">
            {OPENART_ASPECTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAspect(a.id)}
                className={
                  "px-2.5 py-1 rounded-full text-[11px] " +
                  (aspect === a.id
                    ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </Field>

        {kind === "video" && (
          <Field label="Duration">
            <div className="flex gap-2">
              {([5, 8, 10] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs " +
                    (duration === d
                      ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                      : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
                  }
                >
                  {d}s
                </button>
              ))}
            </div>
          </Field>
        )}

        {showImageInput && (
          <Field label={kind === "video" ? "Reference image (image→video)" : "Source image (edit)"}>
            <div className="flex items-center gap-2">
              <label className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer inline-flex items-center gap-1.5">
                {uploading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>📎 {imageUrl ? "Replace" : "Upload"}</>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              {imageUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt="reference"
                    width={32}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    className="w-8 h-8 object-cover rounded border border-[var(--color-border)]"
                  />
                  <button
                    onClick={() => setImageUrl(null)}
                    className="text-[11px] text-[var(--color-muted)] hover:text-red-700"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </Field>
        )}

        {kind === "image" && (
          <Field label="Character ID (optional)">
            <input
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              placeholder="Paste an OpenArt character id for consistent likeness"
              aria-label="OpenArt character id"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
            <p className="text-[11px] text-[var(--color-muted)] mt-1">
              Get IDs at openart.ai/characters
            </p>
          </Field>
        )}

        <button
          onClick={go}
          disabled={pending || !status?.available}
          className="w-full bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating via OpenArt… (1-3 min)
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate {kind}
            </>
          )}
        </button>

        {err && <ErrorBox message={err} />}
        <CostNote text="Drains credits from your OpenArt account. No public API — runs through your local logged-in browser profile." />
        <div className="text-[11px] text-[var(--color-muted)] leading-relaxed">
          <strong>Heads up:</strong> if the run fails with a /login redirect, the
          OpenArt session expired. From a terminal:{" "}
          <code>python scripts/openart_video.py login</code> in the namaha repo.
        </div>
      </section>

      <section className="lg:col-span-3">
        <PreviewPanel asset={result} pending={pending} kind={kind === "video" ? "video" : "image"} />
      </section>
    </div>
  );
}

// ─── LIBRARY TAB ───────────────────────────────────────────────

function LibraryTab() {
  const [items, setItems] = useState<StudioAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "IMAGE" | "VIDEO">("all");

  // Track mount status so async work after unmount doesn't setState.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const rows = await listAssets({
        type: filter === "all" ? undefined : filter,
      });
      if (mountedRef.current) setItems(rows);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        {(["all", "IMAGE", "VIDEO"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1.5 rounded-full text-xs " +
              (filter === f
                ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                : "bg-[var(--color-surface-2)] text-[var(--color-muted)]")
            }
          >
            {f === "all" ? "All" : f === "IMAGE" ? "Images" : "Videos"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-[var(--color-muted)] flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          msg="Nothing here yet. Generate something on the Image or Video tab."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((a) => (
            <AssetCard key={a.id} asset={a} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PREVIEW + ASSET CARD ─────────────────────────────────────

function PreviewPanel({
  asset,
  pending,
  kind,
}: {
  asset: StudioAsset | null;
  pending: boolean;
  kind: "image" | "video";
}) {
  if (pending) {
    return (
      <div className="border rounded-xl bg-[var(--color-surface)] p-10 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-muted)]" />
          <p className="text-sm text-[var(--color-muted)] mt-3">
            {kind === "image" ? "Painting your image…" : "Rendering your video…"}
          </p>
        </div>
      </div>
    );
  }
  if (!asset) {
    return (
      <div className="border rounded-xl bg-[var(--color-surface)] p-10 flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-[var(--color-muted)]">
          Your generated {kind} will appear here.
        </p>
      </div>
    );
  }
  return <AssetCard asset={asset} onChange={() => {}} />;
}

function AssetCard({
  asset,
  onChange,
}: {
  asset: StudioAsset;
  onChange: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onUse() {
    setBusy(true);
    try {
      const { draftId } = await useInDraft(asset.id);
      router.push(`/drafts?focus=${draftId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this asset?")) return;
    setBusy(true);
    try {
      await deleteAsset(asset.id);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  function onCopy() {
    navigator.clipboard.writeText(asset.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <article className="border rounded-xl bg-[var(--color-surface)] overflow-hidden flex flex-col">
      <div className="bg-[var(--color-surface-2)] aspect-square w-full overflow-hidden flex items-center justify-center">
        {asset.status === "FAILED" ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-6 h-6 text-red-700 mx-auto" />
            <p className="text-xs text-[var(--color-muted)] mt-2">Failed to generate</p>
          </div>
        ) : asset.type === "IMAGE" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.url}
            alt={asset.prompt}
            loading="lazy"
            decoding="async"
            width={asset.width ?? 1024}
            height={asset.height ?? 1024}
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            src={asset.url}
            controls
            playsInline
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <p className="text-xs text-[var(--color-muted)] line-clamp-3">{asset.prompt}</p>

        <div className="flex flex-wrap gap-1.5 text-[10px] text-[var(--color-muted)]">
          <span className="bg-[var(--color-surface-2)] rounded-full px-2 py-0.5">
            {asset.model}
          </span>
          {asset.size && (
            <span className="bg-[var(--color-surface-2)] rounded-full px-2 py-0.5">
              {asset.size}
            </span>
          )}
          {asset.durationSec && (
            <span className="bg-[var(--color-surface-2)] rounded-full px-2 py-0.5">
              {asset.durationSec}s
            </span>
          )}
          {asset.costCents != null && (
            <span className="bg-[var(--color-surface-2)] rounded-full px-2 py-0.5">
              ~${(asset.costCents / 100).toFixed(2)}
            </span>
          )}
        </div>

        {asset.status === "READY" && (
          <div className="mt-auto flex gap-2">
            <button
              onClick={onUse}
              disabled={busy}
              className="flex-1 bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-md py-1.5 text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Send className="w-3 h-3" /> Use in draft
            </button>
            <button
              onClick={onCopy}
              className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-md p-1.5"
              title="Copy URL"
            >
              {copied ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="bg-[var(--color-surface-2)] hover:bg-red-100 hover:text-red-800 rounded-md p-1.5"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        {asset.status === "FAILED" && asset.error && (
          <div className="text-[10px] text-red-800 bg-red-100 rounded p-2 line-clamp-3">
            {asset.error}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── small components ─────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-100 border border-red-300 text-red-900 text-xs rounded-lg p-3 flex gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

function CostNote({ text }: { text: string }) {
  return (
    <p className="text-[11px] text-[var(--color-muted)]">{text}</p>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center text-sm text-[var(--color-muted)]">
      {msg}
    </div>
  );
}
