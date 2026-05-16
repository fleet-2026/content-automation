"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCreator, deleteCreator, rescrapeCreator } from "./actions";
import type { Platform } from "@prisma/client";
import { RefreshCw, Trash2 } from "lucide-react";

const PLATFORMS: Platform[] = ["INSTAGRAM", "TIKTOK", "YOUTUBE"];

export function AddCreatorForm() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("TIKTOK");
  const [handle, setHandle] = useState("");
  const [niche, setNiche] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!handle.trim()) return;
        setErr(null);
        start(async () => {
          try {
            await addCreator({ platform, handle, niche: niche || undefined });
            setHandle("");
            setNiche("");
            router.refresh();
          } catch (e) {
            setErr(String((e as Error).message ?? e));
          }
        });
      }}
      className="border rounded-xl bg-[var(--color-surface)] p-4 flex flex-wrap items-end gap-3"
    >
      <label className="flex-1 min-w-32">
        <span className="block text-xs text-[var(--color-muted)] mb-1">Platform</span>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
        >
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="flex-1 min-w-48">
        <span className="block text-xs text-[var(--color-muted)] mb-1">Handle</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@creator"
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <label className="flex-1 min-w-32">
        <span className="block text-xs text-[var(--color-muted)] mb-1">Niche (optional)</span>
        <input
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="fitness"
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none"
        />
      </label>
      <button
        disabled={pending}
        className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium text-sm disabled:opacity-50"
      >
        {pending ? "Adding…" : "Watch"}
      </button>
      {err && <span className="text-xs text-red-800 basis-full">{err}</span>}
    </form>
  );
}

export function CreatorRowActions({ creatorId }: { creatorId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <button
        title="Re-scrape now"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await rescrapeCreator(creatorId);
            router.refresh();
          })
        }
        className="p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
      <button
        title="Stop watching"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await deleteCreator(creatorId);
            router.refresh();
          })
        }
        className="p-1.5 rounded hover:bg-red-100 text-[var(--color-muted)] hover:text-red-800"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
