"use client";

import { useMemo, useState } from "react";
import type { DailyPost } from "./data";
import { PostCard } from "./post-card";
import {
  AI_TOOLS,
  TOPICS,
  detectTopics,
  matchesTool,
  searchBlob,
  type AiTool,
  type Topic,
} from "./post-tags";

type ToolFilter = "All" | AiTool | "Multi-Tool";
type TopicFilter = "All" | Topic;
type Sort = "newest" | "oldest" | "az";

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "A–Z (title)" },
];

/** Client-side filter/search/sort bar for the daily-post queue. Modeled on
 *  the public resources browser: AI-tool pills, topic pills, a search box,
 *  a sort dropdown, and a live "showing N" count. Tool/topic are derived
 *  from each post's text (see post-tags.ts) since there's no DB column. */
export function FilteredList({ posts }: { posts: DailyPost[] }) {
  const [tool, setTool] = useState<ToolFilter>("All");
  const [topic, setTopic] = useState<TopicFilter>("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  // Precompute the searchable blob + topics once per post list.
  const indexed = useMemo(
    () =>
      posts.map((p) => ({
        post: p,
        blob: searchBlob(p),
        topics: detectTopics(p),
      })),
    [posts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = indexed.filter(({ post, blob, topics }) => {
      if (tool !== "All" && !matchesTool(post, tool)) return false;
      if (topic !== "All" && !topics.includes(topic)) return false;
      if (q && !blob.includes(q)) return false;
      return true;
    });
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === "az") return a.post.title.localeCompare(b.post.title);
      const ai = a.post.index ?? 0;
      const bi = b.post.index ?? 0;
      return sort === "oldest" ? ai - bi : bi - ai;
    });
    return sorted.map((r) => r.post);
  }, [indexed, tool, topic, query, sort]);

  return (
    <div>
      {/* ─── BY AI TOOL ─────────────────────────────────────────── */}
      <FilterGroup label="By AI tool">
        <Pill active={tool === "All"} onClick={() => setTool("All")}>
          All
        </Pill>
        {AI_TOOLS.map((t) => (
          <Pill key={t} active={tool === t} onClick={() => setTool(t)}>
            {t}
          </Pill>
        ))}
        <Pill
          active={tool === "Multi-Tool"}
          onClick={() => setTool("Multi-Tool")}
        >
          Multi-Tool
        </Pill>
      </FilterGroup>

      {/* ─── BY TOPIC ───────────────────────────────────────────── */}
      <FilterGroup label="By topic">
        <Pill active={topic === "All"} onClick={() => setTopic("All")}>
          All
        </Pill>
        {TOPICS.map((t) => (
          <Pill key={t} active={topic === t} onClick={() => setTopic(t)}>
            {t}
          </Pill>
        ))}
      </FilterGroup>

      {/* ─── SEARCH + SORT ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-6 mb-4">
        <div className="flex-1 min-w-[240px]">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
            Search
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try a tool or keyword. E.g. claude, mcp, prompts…"
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
            Sort by
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm outline-none focus:border-[var(--color-accent)] cursor-pointer"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── COUNT ──────────────────────────────────────────────── */}
      <p className="text-sm text-[var(--color-muted)] mb-5">
        Showing <strong className="text-[var(--color-text)]">{filtered.length}</strong>{" "}
        {filtered.length === 1 ? "post" : "posts"}
        {(tool !== "All" || topic !== "All" || query.trim()) && (
          <button
            type="button"
            onClick={() => {
              setTool("All");
              setTopic("All");
              setQuery("");
            }}
            className="ml-3 underline hover:text-[var(--color-text)]"
          >
            Clear filters
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
          No posts match these filters. Try clearing them or a different search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <PostCard key={p.slug} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)] mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-1.5 rounded-full text-sm font-medium transition " +
        (active
          ? "bg-[var(--color-text)] text-[var(--color-text-on-dark)]"
          : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]")
      }
    >
      {children}
    </button>
  );
}
