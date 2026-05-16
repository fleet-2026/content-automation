"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Upload, Send, CalendarClock, CheckCircle2 } from "lucide-react";
import { generateHookVariants, saveDraft, publishDraftNow, scheduleDraft } from "./actions";
import type { Platform } from "@prisma/client";

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
}: {
  connectedPlatforms: Platform[];
  initialDraft?: InitialDraft;
  initialCaptionPrefill?: string | null;
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
  const [mediaUrl, setMediaUrl] = useState<string | null>(initialDraft?.mediaUrl ?? null);
  const [platforms, setPlatforms] = useState<Platform[]>(
    initialDraft?.platforms.length ? initialDraft.platforms : connectedPlatforms,
  );
  const [scheduledFor, setScheduledFor] = useState<string>(initialDraft?.scheduledFor ?? "");
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

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
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.message || body?.error || `HTTP ${res.status}`;
        throw new Error(`Upload failed: ${msg}`);
      }
      const { url } = (await res.json()) as { url: string };
      setMediaUrl(url);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setUploading(false);
      // reset input so picking the same file again still triggers onChange
      e.target.value = "";
    }
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
          mediaUrl,
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
            mediaUrl,
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
            mediaUrl,
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

        <Field label="Media (image or video URL)">
          <div className="flex items-center gap-3">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm">
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload"}
              <input
                type="file"
                hidden
                accept="image/*,video/*"
                onChange={handleUpload}
              />
            </label>
            <input
              value={mediaUrl ?? ""}
              onChange={(e) => setMediaUrl(e.target.value || null)}
              placeholder="or paste a public URL"
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] text-sm"
            />
          </div>
          {mediaUrl && (
            <div className="mt-2 text-xs text-[var(--color-muted)] truncate">{mediaUrl}</div>
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
