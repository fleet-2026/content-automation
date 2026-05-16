import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const userId = (await tryGetUser()) ?? undefined;

  const drafts = userId
    ? await safe(
        () =>
          prisma.draft.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 50,
          }),
        [],
      )
    : [];

  return (
    <div className="px-8 py-10 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Drafts & queue</h1>
        <Link
          href="/compose"
          className="text-sm px-4 py-2 rounded-lg bg-[var(--color-accent)] text-black font-medium"
        >
          New post
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center">
          <h2 className="text-lg font-semibold mb-2">No drafts yet</h2>
          <p className="text-sm text-[var(--color-muted)] mb-5 max-w-md mx-auto">
            Drafts you save or schedule will live here. Generate hooks,
            attach media from Studio, and queue posts across IG / TikTok /
            YouTube.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link
              href="/compose"
              className="bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Compose your first post →
            </Link>
            <Link
              href="/voice"
              className="bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] rounded-lg px-4 py-2 text-sm font-medium"
            >
              Or dump a thought to Voice →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <article key={d.id} className="border rounded-xl bg-[var(--color-surface)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {d.selectedHook && (
                    <p className="font-medium leading-snug">&ldquo;{d.selectedHook}&rdquo;</p>
                  )}
                  <p className="text-sm text-[var(--color-muted)] mt-1 line-clamp-2">{d.caption}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[var(--color-muted)]">
                    <StatusBadge status={d.status} />
                    {d.platforms.map((p) => (
                      <span key={p}>{p.toLowerCase()}</span>
                    ))}
                    {d.scheduledFor && (
                      <span>scheduled for {new Date(d.scheduledFor).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                {d.mediaUrl && /\.(jpg|jpeg|png|webp)$/i.test(d.mediaUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.mediaUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={96}
                    height={96}
                    className="w-24 h-24 object-cover rounded-lg shrink-0 bg-[var(--color-surface-2)]"
                  />
                ) : d.mediaUrl ? (
                  <div className="w-24 h-24 grid place-items-center text-xs text-[var(--color-muted)] rounded-lg bg-[var(--color-surface-2)] shrink-0">
                    video
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-[var(--color-surface-2)] text-[var(--color-muted)]",
    APPROVED: "bg-blue-100 text-blue-800",
    SCHEDULED: "bg-amber-100 text-amber-800",
    PUBLISHING: "bg-purple-100 text-purple-800",
    PUBLISHED: "bg-emerald-100 text-emerald-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span className={"text-[10px] px-2 py-0.5 rounded uppercase tracking-wider " + (colors[status] ?? "")}>
      {status.toLowerCase()}
    </span>
  );
}
