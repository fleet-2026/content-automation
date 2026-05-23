import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { formatNumber } from "@/lib/utils";
import { AddCreatorForm, CreatorRowActions } from "./creator-form";
import { DEMO, demoCreators } from "@/lib/demo-data";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const userId = (await tryGetUser()) ?? undefined;

  const creators: Array<{
    id: string;
    handle: string;
    platform: string;
    displayName: string | null;
    niche: string | null;
    lastScrapedAt: Date | null;
    _count: { posts: number };
  }> = DEMO
    ? demoCreators
    : userId
      ? ((await safe(
          () =>
            prisma.creator.findMany({
              where: { userId },
              orderBy: { createdAt: "desc" },
              include: { _count: { select: { posts: true } } },
            }),
          [],
        )) as typeof demoCreators)
      : [];

  return (
    <div className="px-8 py-10 max-w-5xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        Creators <span className="font-italic-accent text-blush">you watch.</span>
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-6">
        We scrape new posts daily, transcribe videos, and surface viral patterns
        into your hook library.
      </p>

      <div className="mb-6">
        <AddCreatorForm />
      </div>

      {creators.length === 0 ? (
        <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center">
          <h2 className="text-lg font-semibold mb-2">No creators on your watch list</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-md mx-auto">
            Add 5–10 creators in your niche to build a daily intel feed:
            their hooks, viral posts, and growth — synced automatically and
            surfaced in your morning brief.
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Use the form above, or{" "}
            <a
              href="/browse"
              className="text-[var(--color-accent)] underline hover:no-underline"
            >
              search Instagram first
            </a>{" "}
            to preview before committing.
          </p>
        </div>
      ) : (
        <div className="border rounded-xl bg-[var(--color-surface)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="text-left px-4 py-3">Creator</th>
                <th className="text-left px-4 py-3">Platform</th>
                <th className="text-left px-4 py-3">Niche</th>
                <th className="text-right px-4 py-3">Posts scraped</th>
                <th className="text-right px-4 py-3">Last scrape</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-3">
                    <Link href={`/creators/${c.id}`} className="hover:underline">
                      @{c.handle}
                    </Link>
                    {c.displayName && (
                      <div className="text-xs text-[var(--color-muted)]">{c.displayName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {c.platform.toLowerCase()}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{c.niche ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{formatNumber(c._count.posts)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-muted)]">
                    {c.lastScrapedAt ? timeAgo(c.lastScrapedAt) : "never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CreatorRowActions creatorId={c.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function timeAgo(d: Date) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
