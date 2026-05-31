"use client";

import { useState } from "react";
import { DraftCard, type DraftCardData, type AccountStateMap } from "./draft-card";

export function PostedSection({
  drafts,
  accountStateByPlatform,
}: {
  drafts: DraftCardData[];
  accountStateByPlatform: AccountStateMap;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
        Posted ({drafts.length})
        <span className="text-[10px] font-normal ml-1">
          {open ? "click to collapse" : "click to expand"}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 opacity-75">
          {drafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              accountStateByPlatform={accountStateByPlatform}
            />
          ))}
        </div>
      )}
    </section>
  );
}
