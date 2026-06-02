import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { listPosts } from "../daily-post/data";
import { PostCard } from "../daily-post/post-card";

export const metadata: Metadata = {
  title: "Published — Creator OS",
  description: "Posts you've already published to social.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PublishedPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const posts = await listPosts();
  // "Published" = posted to at least one social platform.
  const published = posts
    .filter((p) => (p.postedPlatforms ?? []).length > 0)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            Published <span className="font-italic-accent text-blush">posts.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {published.length} posted to social · auto-filed here once you publish
          </p>
        </div>
        <Link
          href="/daily-post"
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] underline"
        >
          ← Back to daily post
        </Link>
      </div>

      {published.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-muted)]">
          Nothing published yet. Posts move here automatically once you post
          them to a social platform from the{" "}
          <Link href="/daily-post" className="underline">
            daily post editor
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {published.map((p) => (
            <PostCard key={p.slug} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
