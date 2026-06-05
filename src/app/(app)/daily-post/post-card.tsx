import Link from "next/link";
import type { DailyPost } from "./data";

/** Presentational card for a daily-post guide. Plain component (no hooks)
 *  so it can render inside both the server page and the client
 *  PublishedSection. */
export function PostCard({ p }: { p: DailyPost }) {
  const g = p.generated;
  const ready = !!g?.script;
  const platforms = p.postedPlatforms ?? [];

  return (
    <Link
      href={`/daily-post/${p.slug}`}
      className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-text)]/30 transition"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          #{p.index ?? "?"}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {platforms.includes("INSTAGRAM") && (
            <span className="text-[10px] rounded px-1.5 py-0.5 font-bold bg-pink-600 text-white">
              IG ✓
            </span>
          )}
          {platforms.includes("TIKTOK") && (
            <span className="text-[10px] rounded px-1.5 py-0.5 font-bold bg-cyan-700 text-white">
              TT ✓
            </span>
          )}
          {platforms.includes("FACEBOOK") && (
            <span className="text-[10px] rounded px-1.5 py-0.5 font-bold bg-blue-600 text-white">
              FB ✓
            </span>
          )}
          {platforms.includes("LINKEDIN") && (
            <span className="text-[10px] rounded px-1.5 py-0.5 font-bold bg-sky-600 text-white">
              LI ✓
            </span>
          )}
          {/* Solid, high-contrast status so it's unmistakable on the light
              theme: green = published, dark = draft, grey = no script yet. */}
          {p.isPublished ? (
            <span className="text-[10px] rounded px-2 py-0.5 uppercase font-bold bg-emerald-600 text-white">
              ✓ Published
            </span>
          ) : ready ? (
            <span className="text-[10px] rounded px-2 py-0.5 uppercase font-bold bg-stone-800 text-white">
              Draft
            </span>
          ) : (
            <span className="text-[10px] rounded px-2 py-0.5 uppercase font-bold bg-stone-500 text-white">
              Pending
            </span>
          )}
        </div>
      </div>
      <div className="font-semibold leading-snug mb-2">{p.title}</div>
      {g?.hook && (
        <p className="text-xs text-[var(--color-muted)] leading-relaxed line-clamp-3">
          {g.hook}
        </p>
      )}
      {g?.keyword && (
        <div className="mt-3 inline-block rounded bg-[var(--color-text)]/5 px-2 py-0.5 text-[10px] font-mono">
          keyword: {g.keyword}
        </div>
      )}
    </Link>
  );
}
