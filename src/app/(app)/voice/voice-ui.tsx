"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BrainCircuit,
  Mic,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  FileText,
  Send,
  Upload,
} from "lucide-react";
import {
  addSample,
  listSamples,
  removeSample,
  draftFromThought,
  transcribeAndDraft,
} from "./actions";

type Sample = { id: string; text: string; createdAt?: Date | string };
type Draft = { caption: string; hook: string; hashtags: string[]; rationale: string };

type Tab = "draft" | "memory";

export function VoiceUI() {
  const [tab, setTab] = useState<Tab>("draft");

  return (
    <div>
      <div className="border-b border-[var(--color-border)] mb-6 flex flex-wrap gap-1">
        <TabButton id="draft" current={tab} onClick={() => setTab("draft")} icon={Send}>
          From thought
        </TabButton>
        <TabButton id="memory" current={tab} onClick={() => setTab("memory")} icon={BrainCircuit}>
          Voice memory
        </TabButton>
      </div>

      {tab === "draft" ? <DraftTab /> : <MemoryTab />}
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

// ─── DRAFT TAB ────────────────────────────────────────────

function DraftTab() {
  const router = useRouter();
  const [thought, setThought] = useState("");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [samplesUsed, setSamplesUsed] = useState<{ id: string; text: string }[]>([]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function go() {
    if (!thought.trim()) return;
    setErr(null);
    setDrafts([]);
    start(async () => {
      try {
        const r = await draftFromThought(thought);
        setDrafts(r.drafts);
        setSamplesUsed(r.samplesUsed);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    setDrafts([]);
    setTranscript(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!upRes.ok) {
        const body = await upRes.json().catch(() => ({}));
        const msg = body?.message || body?.error || `HTTP ${upRes.status}`;
        throw new Error(`Upload failed: ${msg}`);
      }
      const { url } = (await upRes.json()) as { url: string };
      const r = await transcribeAndDraft(url);
      setTranscript(r.transcript);
      setThought(r.transcript);
      setDrafts(r.drafts);
      setSamplesUsed(r.samplesUsed);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
            Your raw thought
          </label>
          <textarea
            value={thought}
            onChange={(e) => setThought(e.target.value)}
            rows={6}
            placeholder="Type your idea, or upload a voice note. Doesn't have to be polished — just dump it."
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
          />
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {uploading ? "Transcribing…" : "Upload voice note"}
              <input type="file" hidden accept="audio/*,video/*" onChange={handleAudioUpload} />
            </label>
            <button
              onClick={go}
              disabled={pending || !thought.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Generate 3 drafts
            </button>
          </div>
        </div>

        {err && <ErrorBox message={err} />}

        {transcript && (
          <div className="border rounded-xl bg-[var(--color-surface-2)] p-4 text-sm">
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
              Transcript
            </div>
            <p className="leading-relaxed">{transcript}</p>
          </div>
        )}

        {drafts.length > 0 && (
          <div className="space-y-3">
            {drafts.map((d, i) => (
              <DraftCard key={i} draft={d} index={i + 1} onUseInCompose={() => {
                const text = `${d.hook}\n\n${d.caption}`;
                router.push(`/compose?prefill=${encodeURIComponent(text)}`);
              }} />
            ))}
          </div>
        )}
      </div>

      <aside>
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-2">
          Voice samples used
        </div>
        {samplesUsed.length === 0 ? (
          <div className="border rounded-lg bg-[var(--color-surface)] p-4 text-xs text-[var(--color-muted)]">
            Drafts will sound generic until you add samples in the <strong>Voice memory</strong> tab.
          </div>
        ) : (
          <ul className="space-y-2">
            {samplesUsed.map((s) => (
              <li
                key={s.id}
                className="border rounded-lg bg-[var(--color-surface)] p-3 text-xs leading-relaxed line-clamp-4"
              >
                {s.text}
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function DraftCard({
  draft,
  index,
  onUseInCompose,
}: {
  draft: Draft;
  index: number;
  onUseInCompose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <article className="border rounded-xl bg-[var(--color-surface)] p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            Draft {index}
          </div>
          <div className="font-medium leading-snug mt-1">{draft.hook}</div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={async () => {
              const text = `${draft.hook}\n\n${draft.caption}\n\n${draft.hashtags.map((h) => "#" + h).join(" ")}`;
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
            title="Copy"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-800" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onUseInCompose}
            className="text-xs px-2 py-1 rounded bg-[var(--color-accent)] text-[var(--color-text-on-dark)]"
            title="Use in Compose"
          >
            Use →
          </button>
        </div>
      </div>
      <p className="text-sm whitespace-pre-wrap leading-relaxed">{draft.caption}</p>
      {draft.hashtags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {draft.hashtags.map((h) => (
            <span
              key={h}
              className="text-xs px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-muted)]"
            >
              #{h}
            </span>
          ))}
        </div>
      )}
      {draft.rationale && (
        <p className="text-xs text-[var(--color-muted)] mt-3 italic">— {draft.rationale}</p>
      )}
    </article>
  );
}

// ─── MEMORY TAB ───────────────────────────────────────────

function MemoryTab() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSamples()
      .then((s) => {
        if (!cancelled) setSamples(s);
      })
      .catch((e) => {
        if (!cancelled) setErr(`Couldn't load voice samples: ${(e as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function add() {
    if (text.trim().length < 30) {
      setErr("At least 30 characters needed.");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await addSample(text.trim());
        setText("");
        const fresh = await listSamples();
        setSamples(fresh);
      } catch (e) {
        setErr(String((e as Error).message ?? e));
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      await removeSample(id);
      setSamples((cur) => cur.filter((s) => s.id !== id));
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      <div className="space-y-4">
        <div className="border rounded-xl bg-[var(--color-surface)] p-5">
          <h3 className="text-sm font-semibold mb-1">Add a writing sample</h3>
          <p className="text-xs text-[var(--color-muted)] mb-3">
            Paste a caption, post, email, or anything you've written that sounds like YOU. 30–2000 chars.
            The drafter will retrieve the most relevant samples and write in that exact voice.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste a real example of your writing — the messier and more 'you' the better."
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] resize-y"
          />
          <div className="flex items-center justify-between mt-2 text-xs text-[var(--color-muted)]">
            <span>{text.length} / 2000</span>
            <button
              onClick={add}
              disabled={pending || text.trim().length < 30}
              className="px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium text-sm disabled:opacity-50 inline-flex items-center gap-1"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add sample
            </button>
          </div>
          {err && <ErrorBox message={err} />}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-2 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Your voice memory ({samples.length})
          </div>
          {samples.length === 0 ? (
            <div className="border rounded-xl bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
              No samples yet. Aim for 5–10 to get strong voice consistency.
            </div>
          ) : (
            <ul className="space-y-2">
              {samples.map((s) => (
                <li
                  key={s.id}
                  className="border rounded-lg bg-[var(--color-surface)] p-4 flex items-start gap-3"
                >
                  <p className="flex-1 text-sm leading-relaxed line-clamp-4">{s.text}</p>
                  <button
                    onClick={() => remove(s.id)}
                    className="p-1.5 rounded hover:bg-red-100 text-[var(--color-muted)] hover:text-red-800 shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="border rounded-xl bg-[var(--color-surface)] p-5 h-fit">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-[var(--color-accent)]" />
          How voice memory works
        </h3>
        <ol className="text-xs text-[var(--color-muted)] space-y-2 list-decimal ml-4">
          <li>Each sample is embedded with OpenAI text-embedding-3-small.</li>
          <li>When you draft, we pull the top-5 most similar samples to your thought.</li>
          <li>Those samples become the voice context for Claude — drafts mirror your cadence, slang, and capitalization.</li>
          <li>More variety = better matching. Aim for 5–15 samples covering different moods.</li>
        </ol>
      </aside>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-100 text-red-800 text-sm px-4 py-3 mt-2">
      <span className="font-semibold">Error: </span>
      {message}
    </div>
  );
}
