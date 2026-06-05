import Link from "next/link";
import type { DailyPost } from "./data";
import { DeleteGuideButton } from "./delete-guide-button";

/** Presentational card for a daily-post guide. The whole card is a click
 *  target into the editor (via an absolute overlay <Link>), with a delete
 *  button layered on top in the corner. The content wrapper is
 *  pointer-events-none so clicks fall through to the link — except the
 *  delete button, which re-enables them. */
export function PostCard({ p }: { p: DailyPost }) {
  const g = p.generated;
  const ready = !!g?.script;
  const platforms = p.postedPlatforms ?? [];

  return (
    <article className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-text)]/30 transition">
      {/* Full-card click target, sits beneath the content. */}
      <Link
        href={`/daily-post/${p.slug}`}
        aria-label={`Edit ${p.title}`}
        className="absolute inset-0 z-0 rounded-xl"
      />

      {/* Delete — layered above the overlay link in the top-right corner. */}
      <DeleteGuideButton
        slug={p.slug}
        title={p.title}
        className="absolute top-3 right-3 z-20"
      />

      <div className="relative z-10 pointer-events-none">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          #{p.index ?? "?"}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap pr-8">
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
      </div>
    </article>
  );
}
