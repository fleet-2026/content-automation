"use client";

import { useState } from "react";
import Link from "next/link";

type GuideRow = {
  slug: string;
  title: string;
  index: number;
  hook: string;
  keyword: string;
  hasVideo: boolean;
  imageCount: number;
  isPublished: boolean;
  postedPlatforms: string[];
  hasScript: boolean;
  hasCaption: boolean;
  scriptScore: number | null;
  captionScore: number | null;
};

type Filter = "all" | "needs-media" | "needs-social" | "ready" | "live";

export default function TrackerTable({ guides }: { guides: GuideRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = guides.filter((g) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !g.title.toLowerCase().includes(q) &&
        !g.hook.toLowerCase().includes(q) &&
        !g.keyword.toLowerCase().includes(q) &&
        !String(g.index).includes(q)
      )
        return false;
    }
    switch (filter) {
      case "needs-media":
        return !g.hasVideo && g.imageCount === 0;
      case "needs-social":
        return g.postedPlatforms.length === 0 && (g.hasVideo || g.imageCount > 0);
      case "ready":
        return g.hasScript && g.hasCaption && !g.isPublished;
      case "live":
        return g.isPublished;
      default:
        return true;
    }
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: guides.length },
    {
      key: "needs-media",
      label: "Needs media",
      count: guides.filter((g) => !g.hasVideo && g.imageCount === 0).length,
    },
    {
      key: "needs-social",
      label: "Not posted",
      count: guides.filter((g) => g.postedPlatforms.length === 0 && (g.hasVideo || g.imageCount > 0)).length,
    },
    {
      key: "ready",
      label: "Ready",
      count: guides.filter((g) => g.hasScript && g.hasCaption && !g.isPublished).length,
    },
    {
      key: "live",
      label: "Live",
      count: guides.filter((g) => g.isPublished).length,
    },
  ];

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition " +
                (filter === f.key
                  ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
                  : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)] hover:border-[var(--color-text)]/30")
              }
            >
              {f.label}{" "}
              <span className="opacity-60">{f.count}</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, hook, keyword..."
          className="ml-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs w-56 focus:border-[var(--color-text)]/40 focus:outline-none"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_5.5rem_5rem_6rem_5rem_5rem] gap-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-2.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold">
          <div>#</div>
          <div>Title / Hook</div>
          <div className="text-center">Quality</div>
          <div className="text-center">Media</div>
          <div className="text-center">Socials</div>
          <div className="text-center">Site</div>
          <div className="text-center">CTA</div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
            No guides match this filter.
          </div>
        ) : (
          filtered.map((g) => <Row key={g.slug} g={g} />)
        )}
      </div>

      <div className="mt-3 text-[10px] text-[var(--color-muted)]">
        Showing {filtered.length} of {guides.length} guides
      </div>
    </div>
  );
}

function Row({ g }: { g: GuideRow }) {
  const hasMedia = g.hasVideo || g.imageCount > 0;
  const platforms = g.postedPlatforms;

  return (
    <Link
      href={`/daily-post/${g.slug}`}
      className="grid grid-cols-[3rem_1fr_5.5rem_5rem_6rem_5rem_5rem] gap-0 px-4 py-3 border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface)]/50 transition items-center"
    >
      {/* Day number */}
      <div className="text-sm font-semibold text-[var(--color-muted)]">
        {g.index}
      </div>

      {/* Title + hook */}
      <div className="min-w-0 pr-4">
        <div className="text-sm font-medium leading-snug truncate">
          {g.title}
        </div>
        {g.hook && (
          <div className="text-[11px] text-[var(--color-muted)] leading-snug truncate mt-0.5">
            {g.hook}
          </div>
        )}
      </div>

      {/* Quality scores (AI-rated script + caption) */}
      <div className="text-center">
        {g.scriptScore != null || g.captionScore != null ? (
          <div className="flex flex-col items-center gap-0.5">
            {g.scriptScore != null && (
              <span
                className={`inline-block rounded border px-1 py-0.5 text-[9px] font-bold ${
                  g.scriptScore >= 8
                    ? "bg-emerald-600 text-white border-transparent"
                    : g.scriptScore >= 6
                    ? "bg-amber-600 text-white border-transparent"
                    : "bg-red-600 text-white border-transparent"
                }`}
              >
                S:{g.scriptScore}
              </span>
            )}
            {g.captionScore != null && (
              <span
                className={`inline-block rounded border px-1 py-0.5 text-[9px] font-bold ${
                  g.captionScore >= 8
                    ? "bg-emerald-600 text-white border-transparent"
                    : g.captionScore >= 6
                    ? "bg-amber-600 text-white border-transparent"
                    : "bg-red-600 text-white border-transparent"
                }`}
              >
                C:{g.captionScore}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-zinc-500">—</span>
        )}
      </div>

      {/* Media status */}
      <div className="text-center">
        {g.hasVideo ? (
          <span className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-purple-600 text-white border-transparent">
            Video
          </span>
        ) : g.imageCount > 0 ? (
          <span className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 text-white border-transparent">
            {g.imageCount} img
          </span>
        ) : (
          <span className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-stone-500 text-white border-transparent">
            None
          </span>
        )}
      </div>

      {/* Social platforms */}
      <div className="flex justify-center gap-1 flex-wrap">
        {platforms.length === 0 ? (
          <span className="text-[10px] text-zinc-500">—</span>
        ) : (
          <>
            {platforms.includes("INSTAGRAM") && (
              <span className="rounded border px-1 py-0.5 text-[9px] font-bold bg-pink-600 text-white border-transparent">
                IG
              </span>
            )}
            {platforms.includes("TIKTOK") && (
              <span className="rounded border px-1 py-0.5 text-[9px] font-bold bg-cyan-700 text-white border-transparent">
                TT
              </span>
            )}
            {platforms.includes("FACEBOOK") && (
              <span className="rounded border px-1 py-0.5 text-[9px] font-bold bg-blue-600 text-white border-transparent">
                FB
              </span>
            )}
            {platforms.includes("LINKEDIN") && (
              <span className="rounded border px-1 py-0.5 text-[9px] font-bold bg-sky-600 text-white border-transparent">
                LI
              </span>
            )}
          </>
        )}
      </div>

      {/* Published to /guides site */}
      <div className="text-center">
        {g.isPublished ? (
          <span className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white border-transparent">
            Live
          </span>
        ) : g.hasScript && g.hasCaption ? (
          <span className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-amber-600 text-white border-transparent">
            Draft
          </span>
        ) : (
          <span className="inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold bg-stone-500 text-white border-transparent">
            WIP
          </span>
        )}
      </div>

      {/* ManyChat keyword */}
      <div className="text-center">
        {g.keyword ? (
          <span className="inline-block font-mono text-[10px] font-bold text-white bg-amber-600 rounded px-1.5 py-0.5 truncate max-w-[4.5rem]">
            {g.keyword}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500">—</span>
        )}
      </div>
    </Link>
  );
}
