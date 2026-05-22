"use client";

import { useState, useTransition } from "react";
import { seedTrackerRows } from "./actions";

export default function SeedButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const handleSeed = () => {
    setResult(null);
    startTransition(async () => {
      const res = await seedTrackerRows();
      if (!res.ok) {
        setResult(`⚠ ${res.error}`);
        return;
      }
      setResult(
        `✓ ${res.inserted} new · ${res.enriched} enriched · ${res.total} total days`,
      );
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSeed}
        disabled={isPending}
        className="px-4 py-2 rounded-full bg-amber-500 text-zinc-900 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Seeding…" : "Seed all 31 days"}
      </button>
      {result && <span className="text-xs text-[var(--color-muted)]">{result}</span>}
    </div>
  );
}
