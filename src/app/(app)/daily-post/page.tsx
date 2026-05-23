import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { listPosts } from "./data";
import BulkPublishBar from "./bulk-publish-bar";

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

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl">
          Daily <span className="font-italic-accent text-blush">post.</span>
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          {posts.length} guides · {ready} ready to post (hook + script + caption + hashtags)
        </p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((p) => {
            const g = p.generated;
            const ready = !!g?.script;
            return (
              <Link
                key={p.slug}
                href={`/daily-post/${p.slug}`}
                className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-text)]/30 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                    #{p.index ?? "?"}
                  </span>
                  <div className="flex items-center gap-1">
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
          })}
        </div>
      )}
    </div>
  );
}
