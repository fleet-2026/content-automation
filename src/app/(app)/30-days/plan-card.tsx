import Link from "next/link";
import type { PlanDay } from "./plan";
import { DeleteGuideButton } from "../daily-post/delete-guide-button";

/** Live posting status pulled from the day's DailyGuide row. */
export type PlanGuideStatus = {
  slug: string;
  title: string;
  isPublished: boolean;
  postedPlatforms: string[];
  hasScript: boolean;
  hasVideo: boolean;
  imageCount: number;
};

/** Card for a single day. When the day has been set up (a guide row exists)
 *  the whole card links into the same editor as Daily post — where the user
 *  attaches media, finalises the script/caption, and posts straight to social.
 *  It also surfaces the editorial brief (the four scripting beats) so the day
 *  reads as a content plan and a posting queue at once. */
export function PlanCard({
  d,
  guide,
}: {
  d: PlanDay;
  guide?: PlanGuideStatus;
}) {
  const platforms = guide?.postedPlatforms ?? [];
  const ready = !!guide?.hasScript;
  const hasMedia = !!guide && (guide.hasVideo || guide.imageCount > 0);

  return (
    <article className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-text)]/30">
      {/* Whole-card click target into the editor — only when set up. */}
      {guide && (
        <Link
          href={`/daily-post/${guide.slug}`}
          aria-label={`Open day ${d.day} editor`}
          className="absolute inset-0 z-0 rounded-xl"
        />
      )}
      {guide && (
        <DeleteGuideButton
          slug={guide.slug}
          title={d.step}
          className="absolute top-3 right-3 z-20"
        />
      )}

      <div className="relative z-10 pointer-events-none">
        <div className="mb-2 flex items-start justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            Day {d.day}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap pr-8">
            {platforms.includes("INSTAGRAM") && (
              <span className="rounded bg-pink-600 px-1.5 py-0.5 text-[10px] font-bold text-white">IG ✓</span>
            )}
            {platforms.includes("TIKTOK") && (
              <span className="rounded bg-cyan-700 px-1.5 py-0.5 text-[10px] font-bold text-white">TT ✓</span>
            )}
            {platforms.includes("FACEBOOK") && (
              <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">FB ✓</span>
            )}
            {platforms.includes("LINKEDIN") && (
              <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">LI ✓</span>
            )}
            {guide?.isPublished ? (
              <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">✓ Published</span>
            ) : ready ? (
              <span className="rounded bg-stone-800 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Draft</span>
            ) : (
              <span className="rounded bg-stone-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Pending</span>
            )}
          </div>
        </div>

        <div className="mb-3 font-semibold leading-snug">{d.step}</div>

        <dl className="space-y-2.5 text-xs leading-relaxed">
          <Beat label="Verbal hook" value={d.hook} />
          <Beat label="On-screen text" value={d.onScreen} />
          <Beat label="Caption hook" value={d.caption} />
          <Beat label="CTA" value={d.cta} />
        </dl>

        <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--color-muted)]">
          <span className="inline-block rounded bg-[var(--color-text)]/5 px-2 py-0.5 font-mono">
            keyword: {d.keyword}
          </span>
          {guide && (
            <span>{hasMedia ? "media attached" : "no media yet"}</span>
          )}
        </div>

        {guide && (
          <div className="pointer-events-auto mt-3">
            <Link
              href={`/daily-post/${guide.slug}`}
              className="relative z-10 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-text)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-on-dark)] hover:opacity-90"
            >
              Edit &amp; post →
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function Beat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-0.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className="text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
