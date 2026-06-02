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
            <span className="text-[10px] rounded border px-1.5 py-0.5 font-semibold bg-pink-500/10 text-pink-300 border-pink-500/30">
              IG ✓
            </span>
          )}
          {platforms.includes("TIKTOK") && (
            <span className="text-[10px] rounded border px-1.5 py-0.5 font-semibold bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
              TT ✓
            </span>
          )}
          {platforms.includes("FACEBOOK") && (
            <span className="text-[10px] rounded border px-1.5 py-0.5 font-semibold bg-blue-500/10 text-blue-300 border-blue-500/30">
              FB ✓
            </span>
          )}
          {platforms.includes("LINKEDIN") && (
            <span className="text-[10px] rounded border px-1.5 py-0.5 font-semibold bg-sky-500/10 text-sky-300 border-sky-500/30">
              LI ✓
            </span>
          )}
          {p.isPublished ? (
            <span className="text-[10px] rounded border px-1.5 py-0.5 uppercase font-semibold bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
              live
            </span>
          ) : ready ? (
            <span className="text-[10px] rounded border px-1.5 py-0.5 uppercase font-semibold bg-amber-500/10 text-amber-300 border-amber-500/30">
              draft
            </span>
          ) : (
            <span className="text-[10px] rounded border px-1.5 py-0.5 uppercase font-semibold bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
              pending
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
