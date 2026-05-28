import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { listTrackerGuides } from "@/lib/guides";
import TrackerTable from "./tracker-table";

export const metadata: Metadata = {
  title: "Quick Daily Posts — Creator OS",
  description: "All daily guides at a glance. Track media, socials, and ManyChat status.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const guides = await listTrackerGuides();
  const sorted = [...guides].sort((a, b) => (a.index ?? 999) - (b.index ?? 999));

  const total = sorted.length;
  const withScript = sorted.filter((g) => !!g.script?.trim()).length;
  const withMedia = sorted.filter((g) => !!g.videoUrl || g.imageUrls.length > 0).length;
  const published = sorted.filter((g) => g.isPublished).length;
  const postedToSocial = sorted.filter((g) => g.postedPlatforms.length > 0).length;
  const rated = sorted.filter((g) => g.scriptScore != null || g.captionScore != null).length;

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            Quick daily <span className="font-italic-accent text-blush">posts.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {total} guides · {withScript} scripted · {withMedia} with media · {published} live · {postedToSocial} on socials · {rated} rated
          </p>
        </div>
        <Link
          href="/daily-post"
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
        >
          Full editor view →
        </Link>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-muted)]">
          No guides yet. Add them from the{" "}
          <Link href="/daily-post" className="underline">
            daily post editor
          </Link>
          .
        </div>
      ) : (
        <TrackerTable
          guides={sorted.map((g) => ({
            slug: g.slug,
            title: g.title,
            index: g.index ?? 0,
            hook: g.hook,
            keyword: g.manychatKeyword,
            hasVideo: !!g.videoUrl,
            imageCount: g.imageUrls.length,
            isPublished: g.isPublished,
            postedPlatforms: g.postedPlatforms,
            hasScript: !!g.script?.trim(),
            hasCaption: !!g.caption?.trim(),
            scriptScore: g.scriptScore,
            captionScore: g.captionScore,
          }))}
        />
      )}
    </div>
  );
}
