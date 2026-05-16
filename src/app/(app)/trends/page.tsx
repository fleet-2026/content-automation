import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { getTrendVelocity, getViralCompetitorPosts } from "@/lib/competitors/velocity";
import { formatNumber } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, Flame, Music2, Plus, Sparkles, TrendingUp, Zap } from "lucide-react";
import {
  DEMO,
  demoVelocity,
  demoViralPosts,
  demoNews,
  demoNicheViral,
  demoTrendingAudio,
} from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const userId = (await tryGetUser()) ?? undefined;

  const user = userId
    ? await safe(() => prisma.user.findUnique({ where: { id: userId } }), null)
    : null;
  const niche = user?.niche ?? (DEMO ? "ai" : undefined);

  type V = { topic: string; recent_views: number; prior_views: number; n_recent: number; lift: number };
  type Viral = {
    id: string;
    platform: string;
    publishedAt: Date;
    caption?: string | null;
    hookText?: string | null;
    views: number;
    url?: string | null;
    creator?: { handle: string; platform: string };
  };
  type News = { id: string; title: string; url: string; source: string | null; publishedAt: Date; summary: string | null };

  let velocity: V[] = [];
  let viralFromWatchlist: Viral[] = [];
  let news: News[] = [];

  if (DEMO) {
    velocity = demoVelocity;
    viralFromWatchlist = demoViralPosts as Viral[];
    news = demoNews as News[];
  } else {
    const [v, vp, nw] = await Promise.all([
      safe(() => getTrendVelocity({ niche }), [] as V[]),
      safe(() => getViralCompetitorPosts(8), [] as unknown as Viral[]),
      safe(
        () =>
          prisma.newsItem.findMany({
            where: niche ? { niche } : {},
            orderBy: { publishedAt: "desc" },
            take: 12,
          }),
        [] as News[],
      ),
    ]);
    velocity = v as V[];
    viralFromWatchlist = vp as unknown as Viral[];
    news = nw as News[];
  }

  // Niche-wide viral discovery + trending audio: demo-only for now (production
  // wires Apify hashtag scrapers + TikTok Creative Center / Apify sound scraper).
  const nicheViral = DEMO ? demoNicheViral : [];
  const trendingAudio = DEMO ? demoTrendingAudio : [];

  return (
    <div className="px-8 py-10 max-w-6xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Trends</h1>
        <p className="text-[var(--color-muted)] mt-1">
          What&apos;s heating up in {niche ? `the "${niche}" niche` : "your niche"}.
        </p>
      </div>

      {/* ─── Trend velocity ─── */}
      <section>
        <SectionHeader icon={Flame} title="Trend velocity" subtitle="Topics accelerating week-over-week" />
        {velocity.length === 0 ? (
          <Empty hint="Need at least a week of competitor scrapes for this to populate." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {velocity.map((t, i) => (
              <div key={i} className="border rounded-xl p-4 bg-[var(--color-surface)]">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{t.topic}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                    <Flame className="w-3.5 h-3.5" />
                    {Number(t.lift).toFixed(1)}×
                  </span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  Median {formatNumber(Math.round(Number(t.recent_views)))} views in last 7 days
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Viral in your niche (broader than watchlist) ─── */}
      <section>
        <SectionHeader
          icon={TrendingUp}
          title="Viral in your niche"
          subtitle="Discovered beyond your watchlist via hashtag and topic crawls"
        />
        {nicheViral.length === 0 ? (
          <Empty hint="Set your niche on your profile and the daily crawl will populate this with viral hashtag-discovered posts." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {nicheViral.map((p) => (
              <article key={p.id} className="border rounded-xl bg-[var(--color-surface)] overflow-hidden flex flex-col">
                {p.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={360}
                    className="aspect-video w-full object-cover bg-black"
                  />
                ) : (
                  <div className="aspect-video bg-[var(--color-surface-2)]" />
                )}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                    <span>@{p.handle} · {p.platform.toLowerCase()}</span>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[10px]">{p.discoveredVia}</span>
                  </div>
                  {p.hookText ? (
                    <p className="mt-2 text-sm font-medium leading-snug line-clamp-3">"{p.hookText}"</p>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--color-muted)] line-clamp-3">{p.caption}</p>
                  )}
                  <div className="mt-auto pt-3 flex items-center justify-between text-xs">
                    <span className="font-semibold">{formatNumber(p.views)} views</span>
                    <div className="flex items-center gap-2">
                      {p.url && (
                        <Link
                          href={`/flip?url=${encodeURIComponent(p.url)}`}
                          className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
                        >
                          <Zap className="w-3 h-3" /> Flip
                        </Link>
                      )}
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--color-muted)] hover:text-[var(--color-text)] inline-flex items-center gap-0.5"
                        >
                          Open <ArrowUpRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ─── Trending audio ─── */}
      <section>
        <SectionHeader
          icon={Music2}
          title="Trending audio"
          subtitle="Sounds gaining momentum on TikTok & Instagram Reels — niche-relevant first"
        />
        {trendingAudio.length === 0 ? (
          <Empty hint="Trending audio populates from TikTok Creative Center + Apify scrapers (real data needs APIFY_TOKEN)." />
        ) : (
          <ul className="border rounded-xl bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {trendingAudio.map((a) => (
              <li key={a.id} className="flex items-center gap-4 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-lg shrink-0 bg-[var(--color-surface-2)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{a.title}</p>
                    {a.fitsNiche && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 inline-flex items-center gap-1 shrink-0">
                        <Sparkles className="w-2.5 h-2.5" /> niche fit
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-muted)] truncate">
                    {a.artist} · {a.platform.toLowerCase()} · {a.category} · {a.duration}s
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{formatNumber(a.postsUsing)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">posts using</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-amber-800 flex items-center justify-end gap-1">
                    <Flame className="w-3.5 h-3.5" />
                    +{a.growth}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">7d growth</div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-black font-medium inline-flex items-center gap-1 hover:opacity-90"
                  title="Use in compose"
                >
                  <Plus className="w-3 h-3" /> Use
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Viral from your watchlist ─── */}
      <section>
        <SectionHeader
          icon={Flame}
          title="Viral from your watchlist"
          subtitle="Posts from creators you watch that have hit viral velocity"
        />
        {viralFromWatchlist.length === 0 ? (
          <Empty hint="Add creators to your watchlist to see viral posts here." />
        ) : (
          <ul className="space-y-2">
            {viralFromWatchlist.map((v) => (
              <li
                key={v.id}
                className="border rounded-xl p-4 bg-[var(--color-surface)] flex items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--color-muted)]">
                    @{v.creator?.handle ?? "creator"} · {v.platform.toLowerCase()} ·{" "}
                    {new Date(v.publishedAt).toLocaleDateString()}
                  </div>
                  {v.hookText ? (
                    <p className="font-medium leading-snug mt-1">"{v.hookText}"</p>
                  ) : (
                    <p className="text-sm text-[var(--color-muted)] mt-1 line-clamp-2">{v.caption}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-semibold">{formatNumber(v.views)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">views</div>
                  {v.url && (
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <Link
                        href={`/flip?url=${encodeURIComponent(v.url)}`}
                        className="text-xs text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
                      >
                        <Zap className="w-3 h-3" /> Flip
                      </Link>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] inline-flex items-center gap-0.5"
                      >
                        Open <ArrowUpRight className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Niche news ─── */}
      <section>
        <SectionHeader icon={TrendingUp} title="Niche news" subtitle="What's published in your niche this week" />
        {news.length === 0 ? (
          <Empty hint="Set your niche on your profile and the morning cron will populate this." />
        ) : (
          <ul className="space-y-2">
            {news.map((n) => (
              <li key={n.id} className="border rounded-xl p-4 bg-[var(--color-surface)]">
                <a href={n.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {n.title}
                </a>
                <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] mt-1">
                  <span>{n.source ?? new URL(n.url).hostname}</span>
                  <span>{new Date(n.publishedAt).toLocaleDateString()}</span>
                </div>
                {n.summary && (
                  <p className="text-sm text-[var(--color-muted)] mt-2 line-clamp-2">{n.summary}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--color-muted)]" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {title}
        </h2>
      </div>
      {subtitle && <p className="text-xs text-[var(--color-muted)] mt-1">{subtitle}</p>}
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="border rounded-xl bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
      {hint}
    </div>
  );
}
