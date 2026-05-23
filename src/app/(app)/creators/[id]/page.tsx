import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { formatNumber } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CreatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = (await tryGetUser()) ?? undefined;
  const { id } = await params;

  const creator = userId
    ? await safe(() => prisma.creator.findFirst({ where: { id, userId } }), null)
    : null;

  const posts = creator
    ? await safe(
        () =>
          prisma.competitorPost.findMany({
            where: { creatorId: creator.id },
            orderBy: [{ isViral: "desc" }, { views: "desc" }],
            take: 30,
          }),
        [],
      )
    : [];

  if (!creator) {
    return (
      <div className="px-8 py-10 max-w-5xl">
        <Link href="/creators" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
          ← back to creators
        </Link>
        <div className="mt-6 border rounded-xl bg-[var(--color-surface)] p-10 text-center text-sm text-[var(--color-muted)]">
          Creator not found, or no DB connected yet.
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      <Link href="/creators" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
        ← back to creators
      </Link>
      <h1 className="font-display text-3xl sm:text-4xl mt-2">@{creator.handle}</h1>
      <p className="text-[var(--color-muted)] mt-1 mb-6">
        {creator.platform.toLowerCase()} · {posts.length} scraped posts ·{" "}
        {posts.filter((p) => p.isViral).length} viral
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((p) => (
          <article
            key={p.id}
            className="border rounded-xl bg-[var(--color-surface)] overflow-hidden"
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
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs">
                {p.isViral && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">VIRAL</span>
                )}
                <span className="text-[var(--color-muted)]">
                  {new Date(p.publishedAt).toLocaleDateString()}
                </span>
              </div>
              {p.hookText ? (
                <p className="mt-2 text-sm font-medium leading-snug line-clamp-3">"{p.hookText}"</p>
              ) : (
                <p className="mt-2 text-sm text-[var(--color-muted)] line-clamp-3">{p.caption}</p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Metric label="Views" value={formatNumber(p.views)} />
                <Metric label="Likes" value={formatNumber(p.likes)} />
                <Metric label="Comments" value={formatNumber(p.comments)} />
              </div>
              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--color-accent)] hover:underline mt-3 inline-block"
                >
                  Open ↗
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--color-surface-2)] rounded-md px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
