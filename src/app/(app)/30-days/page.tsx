import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { tryGetUser } from "@/lib/auth-helpers";
import { listPlanGuides } from "@/lib/guides";
import { PLAN } from "./plan";
import { PlanCard, type PlanGuideStatus } from "./plan-card";
import { SetupBar } from "./setup-bar";
import { backfillPlanContent } from "./seed";

export const metadata: Metadata = {
  title: "30 Days — Creator OS",
  description:
    "A 30-day Claude Code content plan you can post to social directly, across four modules: Website, Funnel, App, and Ship & Grow.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ThirtyDaysPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const totalDays = PLAN.reduce((n, m) => n + m.days.length, 0);

  // No auto-seed on page load. Auto-creating plan rows here (and in the editor
  // on open) resurrected days the user had deleted, which made the delete
  // button look broken. The plan is created/synced ONLY via the "Set up the
  // 30-day plan" button (SetupBar) now, so deletes are permanent. An empty plan
  // simply shows that setup prompt.
  let guides = await listPlanGuides();
  // Fill the finished script/caption/hashtags/DM-reply into any day that's
  // still blank. This only UPDATES existing rows — it never creates one — so it
  // cannot bring back a deleted day.
  const { filled } = await backfillPlanContent();
  if (filled > 0) guides = await listPlanGuides();

  // Live guide rows for the plan, keyed by slug so each static day can be
  // matched to its postable record.
  const bySlug = new Map<string, PlanGuideStatus>(
    guides.map((g) => [
      g.slug,
      {
        slug: g.slug,
        title: g.title,
        isPublished: g.isPublished,
        postedPlatforms: g.postedPlatforms,
        hasScript: !!g.script?.trim(),
        hasVideo: !!g.videoUrl,
        imageCount: g.imageUrls.length,
      },
    ]),
  );

  const setupCount = PLAN.flatMap((m) => m.days).filter((d) => bySlug.has(d.slug)).length;
  const publishedCount = guides.filter((g) => g.isPublished).length;
  const postedCount = guides.filter((g) => g.postedPlatforms.length > 0).length;
  // Scripted-but-not-yet-published plan days are eligible for bulk /guides publish.
  const draftReady = guides.filter((g) => !g.isPublished && !!g.script?.trim()).length;

  const notSetUp = setupCount === 0;

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            30 days of{" "}
            <span className="font-italic-accent text-blush">Claude Code.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {setupCount} / {totalDays} set up · {postedCount} posted · {publishedCount} on /guides · website → funnel → app → growth
          </p>
        </div>
        <nav className="flex items-center gap-2 flex-wrap">
          {PLAN.map((m) => (
            <a
              key={m.id}
              href={`#${m.id}`}
              className="text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text)]/30 transition"
            >
              {m.number}. {m.title}
            </a>
          ))}
        </nav>
      </div>

      <SetupBar totalDays={totalDays} setupCount={setupCount} draftCount={draftReady} />

      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 leading-relaxed">
        <strong>How this works.</strong> One short-form video per day for 30 days,
        grouped into four modules. {notSetUp ? (
          <>Click <em>Set up the 30-day plan</em> above to create all 30 day-posts. </>
        ) : (
          <>Each card opens the same editor as <code>Daily post</code> — attach your
          video or image, finalise the script &amp; caption, then{" "}
          <strong>post straight to Instagram, TikTok, Facebook &amp; LinkedIn</strong>. </>
        )}
        The hook, on-screen text, caption, CTA, and ManyChat keyword are pre-filled
        on every day.
      </div>

      <div className="space-y-10">
        {PLAN.map((m) => {
          // Only render days that still have a guide row. Deleting a day removes
          // its guide, so the card drops off the grid entirely instead of
          // lingering as an empty "Pending" slot. Re-add deleted days anytime
          // with the "Set up the 30-day plan" button (it recreates missing days).
          const days = m.days.filter((d) => bySlug.has(d.slug));
          if (days.length === 0) return null;
          return (
            <section key={m.id} id={m.id} className="scroll-mt-6">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">
                  <span className="text-[var(--color-muted)] font-normal">
                    Module {m.number} ·{" "}
                  </span>
                  {m.title}
                  <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                    {days.length} {days.length === 1 ? "day" : "days"}
                  </span>
                </h2>
                <p className="text-sm text-[var(--color-muted)] mt-0.5">{m.subtitle}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {days.map((d) => (
                  <PlanCard key={d.day} d={d} guide={bySlug.get(d.slug)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
