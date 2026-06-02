"use client";

import { useState } from "react";
import type { DailyPost } from "./data";
import { PostCard } from "./post-card";

/** Collapsible "Posted ✓" section. Holds guides already posted to social
 *  so they drop out of the active to-post grid automatically. Collapsed
 *  by default to keep the working area clean. */
export function PublishedSection({ posts }: { posts: DailyPost[] }) {
  const [open, setOpen] = useState(false);
  if (posts.length === 0) return null;

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        Posted ✓ ({posts.length})
        <span className="text-[10px] font-normal ml-1">
          {open ? "click to collapse" : "posted to social — click to view"}
        </span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-80">
          {posts.map((p) => (
            <PostCard key={p.slug} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}
