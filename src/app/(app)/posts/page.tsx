import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { formatNumber } from "@/lib/utils";
import { DEMO, demoPosts } from "@/lib/demo-data";
import Link from "next/link";

export const dynamic = "force-dynamic";

const platforms = ["all", "INSTAGRAM", "YOUTUBE", "TIKTOK"] as const;
const sorts = ["recent", "engagement", "views"] as const;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const userId = (await tryGetUser()) ?? undefined;

  const platform = (platforms as readonly string[]).includes(sp.platform ?? "")
    ? sp.platform!
    : "all";
  const sort = (sorts as readonly string[]).includes(sp.sort ?? "") ? sp.sort! : "recent";

  let posts: Array<{
    id: string;
    platform: string;
    mediaType: string;
    publishedAt: Date;
    url: string | null;
    caption: string | null;
    hookText: string | null;
    thumbnailUrl: string | null;
    views: number;
    likes: number;
    comments: number;
    engagementRate: number | null;
    hook: { id: string; pattern: string | null } | null;
  }> = [];

  if (DEMO) {
    posts = demoPosts.filter((p) => platform === "all" || p.platform === platform);
    if (sort === "engagement") posts = [...posts].sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
    else if (sort === "views") posts = [...posts].sort((a, b) => b.views - a.views);
    else posts = [...posts].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  } else if (userId) {
    const orderBy =
      sort === "engagement"
        ? [{ engagementRate: "desc" as const }, { views: "desc" as const }]
        : sort === "views"
          ? [{ views: "desc" as const }]
          : [{ publishedAt: "desc" as const }];
    posts = (await safe(
      () =>
        prisma.post.findMany({
          where: {
            userId,
            ...(platform !== "all"
              ? { platform: platform as "INSTAGRAM" | "YOUTUBE" | "TIKTOK" }
              : {}),
          },
          orderBy,
          take: 60,
          include: { hook: { select: { id: true, pattern: true } } },
        }),
      [],
    )) as typeof posts;
  }

  return (
    <div className="px-8 py-10 max-w-6xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        Your <span className="font-italic-accent text-blush">posts.</span>
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-6">
        {posts.length} of your synced posts.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {platforms.map((p) => (
          <FilterPill key={p} active={platform === p} href={`?platform=${p}&sort=${sort}`}>
            {p === "all" ? "All" : p.charAt(0) + p.slice(1).toLowerCase()}
          </FilterPill>
        ))}
        <span className="w-px bg-[var(--color-border)] mx-2" />
        {sorts.map((s) => (
          <FilterPill key={s} active={sort === s} href={`?platform=${platform}&sort=${s}`}>
            {s === "recent" ? "Recent" : s === "engagement" ? "Top engagement" : "Top views"}
          </FilterPill>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center">
          <h2 className="text-lg font-semibold mb-2">No posts synced yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-md mx-auto">
            Connect Instagram, TikTok, or YouTube on the dashboard, then
            click <em>Sync now</em>. Posts you publish from here appear here
            too.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/dashboard"
              className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Connect a platform →
            </Link>
            <Link
              href="/compose"
              className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-lg px-4 py-2 text-sm font-medium"
            >
              Or compose a new post →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((p) => (
            <article
              key={p.id}
              className="border rounded-xl bg-[var(--color-surface)] overflow-hidden flex flex-col"
            >
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
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-muted)]">
                    {p.platform.charAt(0) + p.platform.slice(1).toLowerCase()} · {p.mediaType.toLowerCase()}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    {new Date(p.publishedAt).toLocaleDateString()}
                  </span>
                </div>

                {p.hookText && (
                  <p className="mt-3 text-sm font-medium leading-snug line-clamp-3">
                    "{p.hookText}"
                  </p>
                )}
                {!p.hookText && p.caption && (
                  <p className="mt-3 text-sm text-[var(--color-muted)] line-clamp-3">
                    {p.caption}
                  </p>
                )}

                <div className="mt-auto pt-4 grid grid-cols-3 gap-2 text-xs">
                  <Metric label="Views" value={formatNumber(p.views)} />
                  <Metric label="Likes" value={formatNumber(p.likes)} />
                  <Metric
                    label="Engagement"
                    value={p.engagementRate != null ? `${p.engagementRate.toFixed(1)}%` : "—"}
                  />
                </div>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[var(--color-accent)] hover:underline mt-3"
                  >
                    Open ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--color-surface-2)] rounded-md px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "px-3 py-1.5 rounded-full text-xs " +
        (active
          ? "bg-white text-black"
          : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)]")
      }
    >
      {children}
    </Link>
  );
}
