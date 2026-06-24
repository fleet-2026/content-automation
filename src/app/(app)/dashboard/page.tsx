import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { formatNumber } from "@/lib/utils";
import { ConnectButton } from "@/components/connect-button";
import { FollowerGrowthChart, BestTimeChart } from "@/components/charts";
import { MorningBriefCard } from "@/components/morning-brief";
import { Suspense } from "react";
import { PostRatings, type RatedPostForUI } from "@/components/post-ratings";
import { MyLinksSection, MyLinksSectionSkeleton } from "@/components/my-links-section";
import { IntegrationStatus } from "@/components/integration-status";
import { QuickPostCard } from "@/components/quick-post-card";
import { ENABLED_PLATFORMS_ORDERED } from "@/lib/platform-info";
import { getFollowerGrowth, getBestTimeToPost } from "@/lib/analytics";
import { getCompoundingMap } from "@/lib/compound";
import { ratePosts } from "@/lib/post-rating";
import {
  DEMO,
  demoAccounts,
  demoBestTime,
  demoBrief,
  demoCompounding,
  demoCounts,
  demoFollowerGrowth,
} from "@/lib/demo-data";
import type { MorningBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; connect_error?: string }>;
}) {
  const sp = await searchParams;
  const userId = (await tryGetUser()) ?? undefined;
  // MyLinks fetches happen INSIDE <MyLinksSection> below, wrapped in <Suspense>,
  // so the rest of the dashboard streams immediately without waiting on the
  // worst-case 16s parallel hub fetch.
  const user = userId
    ? await safe(
        () => prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
        null,
      )
    : null;

  // ─── DEMO MODE: hardcoded sample data, no DB needed ───
  let accounts: typeof demoAccounts = [];
  let postCount = 0;
  let totalViews = 0;
  let totalLikes = 0;
  let growth = demoFollowerGrowth.map(() => ({ date: "", followers: 0 })).slice(0, 0);
  let bestTime = Array.from({ length: 24 }, (_, h) => ({ hour: h, avgER: 0 }));
  let brief: MorningBrief | null = null;
  let compounding: { a: string; b: string; n: number; avg_er: number; lift: number }[] = [];
  let ratedPosts: RatedPostForUI[] = [];

  if (DEMO) {
    accounts = demoAccounts;
    postCount = demoCounts.postCount;
    totalViews = demoCounts.totalViews;
    totalLikes = demoCounts.totalLikes;
    growth = demoFollowerGrowth;
    bestTime = demoBestTime;
    brief = demoBrief;
    compounding = demoCompounding;
  } else if (userId) {
    const [a, pc, g, bt, tv, tl, br, comp] = await Promise.all([
      safe(
        () =>
          prisma.socialAccount.findMany({
            where: { userId, isActive: true },
            select: { platform: true, username: true, displayName: true, lastSyncedAt: true },
          }),
        [],
      ),
      safe(() => prisma.post.count({ where: { userId } }), 0),
      safe(() => getFollowerGrowth(userId, 60), []),
      safe(() => getBestTimeToPost(userId), bestTime),
      safe(() => prisma.post.aggregate({ where: { userId }, _sum: { views: true } }), { _sum: { views: 0 } } as { _sum: { views: number | null } }),
      safe(() => prisma.post.aggregate({ where: { userId }, _sum: { likes: true } }), { _sum: { likes: 0 } } as { _sum: { likes: number | null } }),
      safe(
        () =>
          prisma.auditLog.findFirst({
            where: { action: "morning-brief.generated", target: userId },
            orderBy: { createdAt: "desc" },
          }),
        null,
      ),
      safe(() => getCompoundingMap(userId, 1), [] as typeof compounding),
    ]);
    accounts = a as typeof demoAccounts;
    postCount = pc;
    growth = g;
    bestTime = bt;
    totalViews = tv._sum.views ?? 0;
    totalLikes = tl._sum.likes ?? 0;
    brief = (br?.details ?? null) as MorningBrief | null;
    compounding = comp as typeof compounding;

    // Rate the user's last 10 posts, worst-first so the dashboard surfaces
    // the ones most worth fixing. Defaults to safe([]) on DB errors.
    const rp = await safe(
      () => ratePosts(userId, { limit: 10, sort: "worst-first" }),
      [],
      "ratePosts",
    );
    ratedPosts = rp.map((p) => ({
      id: p.id,
      caption: p.caption,
      hookText: p.hookText,
      thumbnailUrl: p.thumbnailUrl,
      url: p.url,
      platform: p.platform,
      publishedAt: p.publishedAt.toISOString(),
      rating: {
        score: p.rating.score,
        band: p.rating.band,
        reasons: p.rating.reasons,
        fixable: p.rating.fixable,
      },
    }));
  }

  // Show only platforms that are currently enabled in platform-info.tsx.
  // YouTube and LinkedIn are hidden via `enabled: false` — flip back on
  // in src/lib/platform-info.tsx when you want them visible again.
  const platforms = ENABLED_PLATFORMS_ORDERED;

  return (
    <div className="px-8 py-10 max-w-6xl">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          {/* Editorial display: Fraunces 900 with the SOFT axis, plus
              a Fraunces Italic accent in blush pink. Matches the
              "The takeaway for operators." reference style. */}
          <h1 className="font-display text-4xl sm:text-5xl">
            {userId && user?.name ? (
              <>
                Welcome back,{" "}
                <span className="font-italic-accent text-blush">
                  {user.name.split(" ")[0]}.
                </span>
              </>
            ) : (
              <>
                Your{" "}
                <span className="font-italic-accent text-blush">
                  Descon Fleet.
                </span>
              </>
            )}
          </h1>
          <p className="text-[var(--color-muted)] mt-2">
            {DEMO
              ? "Demo mode — populated with sample data."
              : userId
                ? "Everything you post and everyone you watch, in one place."
                : "Set DATABASE_URL and create a user to populate."}
          </p>
        </div>
      </div>

      {sp.connected && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm">
          Connected {sp.connected}. Posts will sync within a few minutes.
        </div>
      )}
      {sp.connect_error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-sm space-y-1">
          <div className="font-semibold">Connection failed</div>
          <div className="font-mono text-xs break-all">{sp.connect_error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Connected" value={accounts.length} />
        <Stat label="Synced posts" value={formatNumber(postCount)} />
        <Stat label="Total views" value={formatNumber(totalViews)} />
        <Stat label="Total likes" value={formatNumber(totalLikes)} />
      </div>

      {/* Inline composer — write, attach up to 4 images, pick platforms,
          publish/schedule/save without leaving the dashboard. For the heavy
          features (hook A/B simulator, viralize, hook-on-image canvas, full
          10-slot carousel) the card surfaces a link to /compose. */}
      <div className="mb-8">
        <QuickPostCard
          connectedPlatforms={accounts.map((a) => a.platform)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mb-8">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-3">
            Connect your accounts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {platforms.map((p) => {
              const connected = accounts.find((a) => a.platform === p);
              return (
                <div key={p} className="border rounded-xl p-4 bg-[var(--color-surface)]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{p.toLowerCase()}</span>
                    <span
                      className={
                        connected
                          ? "text-xs text-emerald-800"
                          : "text-xs text-[var(--color-muted)]"
                      }
                    >
                      {connected ? "Connected" : "Not connected"}
                    </span>
                  </div>
                  {connected && (
                    <div className="text-xs text-[var(--color-muted)] mt-1">
                      {connected.displayName ?? connected.username ?? "—"}
                      {connected.lastSyncedAt && (
                        <span className="ml-2">synced {timeAgo(connected.lastSyncedAt)}</span>
                      )}
                    </div>
                  )}
                  <ConnectButton platform={p} connected={!!connected} />
                </div>
              );
            })}
          </div>
        </section>

        <MorningBriefCard brief={brief} />
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <Panel title="Follower growth (60d)">
          {growth.length ? (
            <FollowerGrowthChart data={growth} />
          ) : (
            <Empty hint="Connect a platform and sync to populate this chart." />
          )}
        </Panel>
        <Panel title="Best time to post (avg engagement % by hour)">
          {bestTime.some((b) => b.avgER > 0) ? (
            <BestTimeChart data={bestTime} />
          ) : (
            <Empty hint="Need a handful of posts before this becomes useful." />
          )}
        </Panel>
      </section>

      <Suspense fallback={null}>
        <section className="mb-10">
          <IntegrationStatus />
        </section>
      </Suspense>

      {!DEMO && (
        <section className="mb-10">
          <PostRatings posts={ratedPosts} />
        </section>
      )}

      <Suspense fallback={<MyLinksSectionSkeleton />}>
        <MyLinksSection />
      </Suspense>

      {compounding.length > 0 && (
        <section className="border rounded-xl bg-[var(--color-surface)] p-5">
          <h2 className="text-sm font-medium mb-3">Content compounding map</h2>
          <p className="text-xs text-[var(--color-muted)] mb-4">
            Concept pairs that outperform your average. Make more of these combinations.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {compounding.slice(0, 8).map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between border rounded-lg bg-[var(--color-surface-2)] px-3 py-2"
              >
                <span>
                  <span className="capitalize">{c.a}</span>
                  <span className="text-[var(--color-muted)]"> + </span>
                  <span className="capitalize">{c.b}</span>
                </span>
                <span className="text-xs font-semibold text-emerald-800">
                  {Number(c.lift).toFixed(2)}×
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border rounded-xl p-5 bg-[var(--color-surface)]">
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl bg-[var(--color-surface)] p-5">
      <div className="text-sm font-medium mb-3">{title}</div>
      {children}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="h-56 grid place-items-center text-center text-sm text-[var(--color-muted)]">
      {hint}
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
  return `${Math.floor(h / 24)}d ago`;
}
