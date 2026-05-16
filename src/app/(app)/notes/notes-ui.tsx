"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Plus,
  Pin,
  PinOff,
  Trash2,
  Search,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  StickyNote,
} from "lucide-react";
import {
  getNotes,
  newNote,
  saveNote,
  removeNote,
} from "./actions";
import type { NoteSummary } from "@/lib/notes";

type Note = NoteSummary;

export function NotesUI({ initial }: { initial: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const active = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  // ─── Search (debounced) ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      start(async () => {
        try {
          const fresh = await getNotes(query);
          if (cancelled) return;
          setNotes(fresh);
          if (!fresh.find((n) => n.id === activeId)) {
            setActiveId(fresh[0]?.id ?? null);
          }
        } catch (e) {
          if (!cancelled) console.error("[notes] search failed:", e);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function onCreate() {
    const created = await newNote({ content: "" });
    setNotes((cur) => [created, ...cur]);
    setActiveId(created.id);
  }

  async function onTogglePin(n: Note) {
    setNotes((cur) =>
      sortNotes(cur.map((c) => (c.id === n.id ? { ...c, pinned: !c.pinned } : c))),
    );
    await saveNote(n.id, { pinned: !n.pinned });
  }

  async function onDelete(n: Note) {
    if (!confirm("Delete this note?")) return;
    setNotes((cur) => cur.filter((c) => c.id !== n.id));
    if (activeId === n.id) {
      const next = notes.find((c) => c.id !== n.id);
      setActiveId(next?.id ?? null);
    }
    await removeNote(n.id);
  }

  // Patch the active note locally + debounced save.
  //
  // Per-note timers + per-note pending patches: switching notes mid-debounce
  // can no longer cause a stale `active` closure to write the wrong note's
  // fields. Each note's pending edits are flushed against ITS OWN id.
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPatches = useRef<Map<string, Partial<Note>>>(new Map());

  function flushNote(noteId: string) {
    const patch = pendingPatches.current.get(noteId);
    if (!patch) return;
    pendingPatches.current.delete(noteId);
    saveTimers.current.delete(noteId);
    setSavingId(noteId);
    saveNote(noteId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    })
      .then(() => setSavedAt(new Date()))
      .catch((e) => console.error("[notes] save failed:", e))
      .finally(() => {
        setSavingId((cur) => (cur === noteId ? null : cur));
      });
  }

  function patchActive(patch: Partial<Note>) {
    if (!active) return;
    const noteId = active.id; // capture once

    // Optimistic local update
    const updated: Note = { ...active, ...patch, updatedAt: new Date() };
    setNotes((cur) => sortNotes(cur.map((c) => (c.id === noteId ? updated : c))));

    // Merge patches per-note. Switching notes won't lose pending edits.
    const merged = { ...(pendingPatches.current.get(noteId) ?? {}), ...patch };
    pendingPatches.current.set(noteId, merged);

    setSavingId(noteId);
    const existing = saveTimers.current.get(noteId);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(
      noteId,
      setTimeout(() => flushNote(noteId), 500),
    );
  }

  // Flush pending edits when the active note changes (so the user can switch
  // notes without losing in-flight typing).
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      saveTimers.current.forEach((_, id) => flushNote(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 min-h-[600px]">
      {/* Left: list */}
      <aside className="border rounded-xl bg-[var(--color-surface)] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[var(--color-border)] flex flex-col gap-2">
          <button
            onClick={onCreate}
            className="w-full bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> New note
          </button>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, content, tag…"
              aria-label="Search notes"
              className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {pending && notes.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : notes.length === 0 ? (
            <div className="p-6 text-sm text-[var(--color-muted)] text-center">
              {query
                ? "No notes match your search."
                : "Click + New note to start your scratchpad."}
            </div>
          ) : (
            <ul>
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setActiveId(n.id)}
                    className={
                      "w-full text-left px-3 py-2.5 border-b border-[var(--color-border)] flex items-start gap-2 group " +
                      (n.id === activeId
                        ? "bg-[var(--color-surface-2)]"
                        : "hover:bg-[var(--color-surface-2)]")
                    }
                  >
                    {n.pinned && (
                      <Pin className="w-3 h-3 mt-1 text-[var(--color-accent)] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {n.title || firstLine(n.content) || "Untitled"}
                      </div>
                      <div className="text-[11px] text-[var(--color-muted)] truncate mt-0.5">
                        {snippet(n.content)}
                      </div>
                      <div className="text-[10px] text-[var(--color-muted)] mt-1">
                        {fmtRel(new Date(n.updatedAt))}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right: editor */}
      <main className="border rounded-xl bg-[var(--color-surface)] flex flex-col overflow-hidden">
        {!active ? (
          <div className="flex-1 flex items-center justify-center p-10 text-center">
            <div>
              <StickyNote className="w-10 h-10 mx-auto text-[var(--color-muted)] mb-3" />
              <p className="text-sm text-[var(--color-muted)]">
                Pick a note from the left, or create a new one.
              </p>
            </div>
          </div>
        ) : (
          <Editor
            note={active}
            onPatch={patchActive}
            onTogglePin={() => onTogglePin(active)}
            onDelete={() => onDelete(active)}
            saving={savingId === active.id}
            savedAt={savedAt}
          />
        )}
      </main>
    </div>
  );
}

function Editor({
  note,
  onPatch,
  onTogglePin,
  onDelete,
  saving,
  savedAt,
}: {
  note: Note;
  onPatch: (patch: Partial<Note>) => void;
  onTogglePin: () => void;
  onDelete: () => void;
  saving: boolean;
  savedAt: Date | null;
}) {
  const tagsRaw = note.tags.join(", ");
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  function onCopy() {
    navigator.clipboard.writeText(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="border-b border-[var(--color-border)] p-3 flex flex-wrap items-center gap-2">
        <input
          value={note.title ?? ""}
          onChange={(e) => onPatch({ title: e.target.value || null })}
          placeholder="Title (optional)"
          aria-label="Note title"
          className="flex-1 min-w-[200px] bg-transparent border-0 outline-none text-base font-semibold focus:ring-0 px-1"
        />
        <button
          onClick={onTogglePin}
          className={
            "rounded-md p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] " +
            (note.pinned ? "text-[var(--color-accent)]" : "")
          }
          title={note.pinned ? "Unpin" : "Pin"}
        >
          {note.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setShowPreview((p) => !p)}
          className="text-xs px-2 py-1 rounded-md bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
        <button
          onClick={onCopy}
          className="rounded-md p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"
          title="Copy content"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-[var(--color-muted)] hover:text-red-700"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-[var(--color-border)]">
        <input
          value={tagsRaw}
          onChange={(e) =>
            onPatch({
              tags: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          placeholder="Tags: comma, separated, lowercase"
          aria-label="Note tags (comma separated)"
          className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
      </div>

      {showPreview ? (
        <div className="flex-1 overflow-y-auto p-5 text-sm leading-relaxed whitespace-pre-wrap">
          <Linkified text={note.content} />
        </div>
      ) : (
        <textarea
          value={note.content}
          onChange={(e) => onPatch({ content: e.target.value })}
          placeholder={`Drop URLs, snippets, course links — anything you'll reach for later.

Examples:
• Course: https://example.com/course
• Hook bank: 1. "Most people don't realize..." 2. "Here's the truth..."
• Stat to use: 73% of creators…`}
          aria-label="Note content"
          className="flex-1 w-full p-5 bg-transparent border-0 outline-none resize-none text-sm leading-relaxed font-mono"
        />
      )}

      <div className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] text-[var(--color-muted)] flex items-center justify-between">
        <span>
          {saving ? (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          ) : savedAt ? (
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-green-700" /> Saved {fmtRel(savedAt)}
            </span>
          ) : (
            <>Last edit {fmtRel(new Date(note.updatedAt))}</>
          )}
        </span>
        <span>
          {note.content.length} chars · {note.content.split(/\s+/).filter(Boolean).length} words
        </span>
      </div>
    </>
  );
}

// ─── helpers ────────────────────────────────────────────

function Linkified({ text }: { text: string }) {
  // Split on URLs and render each match as a clickable <a>.
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline inline-flex items-center gap-0.5 break-all"
          >
            {part}
            <ExternalLink className="w-3 h-3 inline shrink-0" />
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function firstLine(s: string): string {
  return s.split("\n")[0]?.trim() ?? "";
}

function snippet(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? flat.slice(0, 80) + "…" : flat;
}

function fmtRel(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function sortNotes(arr: Note[]): Note[] {
  return [...arr].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
