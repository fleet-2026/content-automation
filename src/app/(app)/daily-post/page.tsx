import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { listPosts } from "./data";
import BulkPublishBar from "./bulk-publish-bar";
import { PostCard } from "./post-card";

export const metadata: Metadata = {
  title: "Daily Post — Creator OS",
  description: "All scraped guides with ready-to-post hooks, scripts, captions, and hashtags.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DailyPostIndexPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const posts = await listPosts();
  const ready = posts.filter((p) => !!p.generated?.script).length;
  const publishedCount = posts.filter((p) => p.isPublished).length;
  const draftCount = posts.length - publishedCount;

  // Published posts leave the daily-post queue entirely and live on
  // /published. Daily-post only shows what hasn't been published yet.
  const active = posts.filter((p) => !p.isPublished);

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            Daily <span className="font-italic-accent text-blush">post.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {active.length} to publish · {ready} ready · {publishedCount} published
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/published"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
          >
            Published ({publishedCount}) →
          </Link>
          {/* One-stop teleprompter page — all scripts on one scroll, each
              with a Copy button so the user can blast through a recording
              session without clicking into individual editors. */}
          <Link
            href="/scripts"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-text)] text-[var(--color-text-on-dark)] px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            All scripts (copy &amp; record) →
          </Link>
        </div>
      </div>

      <BulkPublishBar totalDrafts={draftCount} totalPublished={publishedCount} />

      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200 leading-relaxed">
        <strong>How this works.</strong> Each card is a guide with a hook,
        talking-head script, caption, hashtags, and ManyChat keyword already
        generated. Flip the <em>Publish</em> toggle on each (or use the
        bulk-publish button above) to push it live on the public{" "}
        <code>/guides</code> site.
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-muted)]">
          No generated posts yet. Run{" "}
          <code>python generate_post_content.py</code> in{" "}
          <code>C:\Users\serka\Fadia voice\</code> first.
        </div>
      ) : (
        <>
          {/* Active — not yet published. Published posts live on /published. */}
          <h2 className="text-lg font-semibold mb-3">
            To publish
            <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
              {active.length}
            </span>
          </h2>
          {active.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
              🎉 Everything&apos;s published. New or unpublished guides show up here ·{" "}
              <Link href="/published" className="underline">view published →</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {active.map((p) => (
                <PostCard key={p.slug} p={p} />
              ))}
            </div>
          )}

        </>
      )}
    </div>
  );
}
