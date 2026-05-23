import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import {
  getTrendVelocity,
  getViralCompetitorPosts,
  getNicheViralPosts,
} from "@/lib/competitors/velocity";
import { formatNumber } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, Flame, Music2, Plus, Sparkles, TrendingUp, Zap, Edit } from "lucide-react";
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

  // Shape returned by getNicheViralPosts — flattened for the UI card.
  type NicheViral = {
    id: string;
    handle: string;
    platform: string;
    discoveredVia: string;
    thumbnailUrl: string | null;
    hookText: string | null;
    caption: string | null;
    views: number;
    url: string | null;
  };

  let velocity: V[] = [];
  let viralFromWatchlist: Viral[] = [];
  let news: News[] = [];
  let nicheViral: NicheViral[] = [];

  if (DEMO) {
    velocity = demoVelocity;
    viralFromWatchlist = demoViralPosts as Viral[];
    news = demoNews as News[];
    nicheViral = demoNicheViral as unknown as NicheViral[];
  } else {
    const [v, vp, nw, nv] = await Promise.all([
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
      // Niche-wide viral: any viral CompetitorPost in the niche (not just
      // the user's watchlist). Reuses the same competitor_posts table we
      // already populate from scrapes — no new schema or scraper needed.
      safe(() => getNicheViralPosts(niche, 12), [] as unknown as Array<{
        id: string;
        platform: string;
        thumbnailUrl: string | null;
        hookText: string | null;
        caption: string | null;
        views: number;
        url: string | null;
        creator?: { handle?: string | null; niche?: string | null };
      }>),
    ]);
    velocity = v as V[];
    viralFromWatchlist = vp as unknown as Viral[];
    news = nw as News[];
    nicheViral = (nv ?? []).map((p) => ({
      id: p.id,
      handle: p.creator?.handle ?? "unknown",
      platform: p.platform,
      // Mark these as discovered via the niche filter, distinct from
      // watchlist-sourced posts. Future hashtag/topic crawlers will set
      // their own discoveredVia tag here.
      discoveredVia: p.creator?.niche === niche ? "niche" : "viral",
      thumbnailUrl: p.thumbnailUrl,
      hookText: p.hookText,
      caption: p.caption,
      views: p.views,
      url: p.url,
    }));
  }

  // Trending audio: still demo-only — no real data source until we wire up
  // a TikTok Creative Center scraper (or Apify sound scrape). The "Use"
  // button now works in demo mode so the UX is testable end-to-end.
  const trendingAudio = DEMO ? demoTrendingAudio : [];

  return (
    <div className="px-8 py-10 max-w-6xl space-y-10">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">
          What&apos;s <span className="font-italic-accent text-blush">trending.</span>
        </h1>
        <p className="text-[var(--color-muted)] mt-1">
          What&apos;s heating up in {niche ? `the "${niche}" niche` : "your niche"}.
        </p>
      </div>

      {/* ─── Trend velocity ─── */}
      <section>
        <SectionHeader icon={Flame} title="Trend velocity" subtitle="Topics accelerating week-over-week" />
        {velocity.length === 0 ? (
          <Empty
            hint="Need at least a week of competitor scrapes for this to populate."
            cta={{ label: "Add creators to watchlist →", href: "/creators" }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {velocity.map((t, i) => (
              <div key={i} className="border rounded-xl p-4 bg-[var(--color-surface)] flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{t.topic}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                    <Flame className="w-3.5 h-3.5" />
                    {Number(t.lift).toFixed(1)}×
                  </span>
                </div>
                <p className="text-xs text-[var(--color-muted)] mt-2 flex-1">
                  Median {formatNumber(Math.round(Number(t.recent_views)))} views in last 7 days
                </p>
                {/* Drop into Compose with the topic pre-filled so the user
                    can immediately draft a post on a hot trend. */}
                <Link
                  href={`/compose?prefill=${encodeURIComponent(`Topic: ${t.topic}\n\nWrite a post about why ${t.topic} is trending right now.`)}`}
                  className="mt-3 text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium inline-flex items-center gap-1 hover:opacity-90 self-start"
                >
                  <Edit className="w-3 h-3" /> Use as topic
                </Link>
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
          <Empty
            hint="No viral posts in your niche yet. Add creators to your watchlist or set your niche on the profile so the crawler can find viral posts."
            cta={{ label: "Add creators →", href: "/creators" }}
          />
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
          <Empty
            hint="Trending audio populates from TikTok Creative Center + Apify scrapers (real data needs APIFY_TOKEN env var). The DEMO mode shows sample audio so you can preview the UI."
            cta={{ label: "Compose a post →", href: "/compose" }}
          />
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
                {/* Drop into Compose with this audio in mind. Since we
                    don't have an actual audio-attach pipeline yet (TikTok
                    and IG require the audio to be picked inside the
                    native app to comply with their music licensing), we
                    instead pre-fill the caption with a reminder to apply
                    this sound when finalizing the post in the platform. */}
                <Link
                  href={`/compose?prefill=${encodeURIComponent(`[Use audio: "${a.title}" by ${a.artist} on ${a.platform.toLowerCase()}]\n\n`)}`}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium inline-flex items-center gap-1 hover:opacity-90"
                  title="Use this audio in a new post"
                >
                  <Plus className="w-3 h-3" /> Use
                </Link>
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
          <Empty
            hint="Add creators to your watchlist to see when their posts hit viral velocity."
            cta={{ label: "Add creators →", href: "/creators" }}
          />
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
          <Empty
            hint="Set your niche on the profile and the morning cron will populate this with news in your space."
            cta={{ label: "Update profile →", href: "/dashboard" }}
          />
        ) : (
          <ul className="space-y-2">
            {news.map((n) => {
              // Best-effort: source domain. Wrap in try/catch because some
              // URLs in old NewsItem rows may be malformed.
              let domain = n.source ?? "";
              if (!domain) {
                try {
                  domain = new URL(n.url).hostname;
                } catch {
                  domain = "";
                }
              }
              // Compose prefill: title + summary (truncated to a sane size
              // so the textarea isn't overwhelmed). The Composer reads
              // ?prefill= via initialCaptionPrefill.
              const prefill = [
                n.title,
                "",
                n.summary ? `Context: ${n.summary.slice(0, 400)}` : "",
                "",
                `Source: ${n.url}`,
              ]
                .filter(Boolean)
                .join("\n");
              return (
                <li key={n.id} className="border rounded-xl p-4 bg-[var(--color-surface)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <a href={n.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {n.title}
                      </a>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] mt-1">
                        {domain && <span>{domain}</span>}
                        <span>{new Date(n.publishedAt).toLocaleDateString()}</span>
                      </div>
                      {n.summary && (
                        <p className="text-sm text-[var(--color-muted)] mt-2 line-clamp-2">{n.summary}</p>
                      )}
                    </div>
                    <Link
                      href={`/compose?prefill=${encodeURIComponent(prefill)}`}
                      className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] font-medium inline-flex items-center gap-1"
                      title="Start a post inspired by this news"
                    >
                      <Edit className="w-3 h-3" /> Compose
                    </Link>
                  </div>
                </li>
              );
            })}
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

function Empty({ hint, cta }: { hint: string; cta?: { label: string; href: string } }) {
  return (
    <div className="border rounded-xl bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
      <p>{hint}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-3 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium hover:opacity-90"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
