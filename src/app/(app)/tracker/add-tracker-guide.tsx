"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTrackerGuide } from "./actions";

export default function AddTrackerGuide() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleOpen = () => {
    setOpen(true);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSubmit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createTrackerGuide(title.trim());
      if (!res.ok) {
        setError(res.error ?? "Failed to create");
        return;
      }
      // Navigate to the new guide's editor
      router.push(`/daily-post/${res.slug}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-lg bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition"
      >
        + Add post
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") { setOpen(false); setTitle(""); }
        }}
        placeholder="Post title..."
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs w-56 focus:border-[var(--color-text)]/40 focus:outline-none"
        disabled={busy}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={busy || !title.trim()}
        className="rounded-lg bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {busy ? "Creating..." : "Create"}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setTitle(""); setError(null); }}
        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        Cancel
      </button>
      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
