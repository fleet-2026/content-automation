import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import Link from "next/link";
import { DraftCard, type DraftCardData } from "./draft-card";
import { PostedSection } from "./posted-section";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const userId = (await tryGetUser()) ?? undefined;

  // Fetch drafts AND recent generated media in parallel — the agent that
  // produces drafts may write to the MediaAsset table independently (i.e.
  // image gen creates a MediaAsset even when no Draft is attached), so the
  // user wants to see "what was generated yesterday" regardless of whether
  // a Draft is wrapped around it yet.
  const [drafts, recentMedia, socialAccounts] = userId
    ? await Promise.all([
        safe(
          () =>
            prisma.draft.findMany({
              where: { userId },
              orderBy: { updatedAt: "desc" },
              take: 50,
            }),
          [],
        ),
        safe(
          () =>
            prisma.mediaAsset.findMany({
              where: { userId, status: "READY" },
              orderBy: { createdAt: "desc" },
              take: 12,
              select: {
                id: true,
                type: true,
                url: true,
                thumbnailUrl: true,
                prompt: true,
                width: true,
                height: true,
                createdAt: true,
              },
            }),
          [],
        ),
        // Social accounts so the DraftCard can detect when a token has
        // been reconnected since a failed publish — turns stale "expired"
        // errors into actionable "ready to retry" hints. Also drives the
        // green-tick connection-health indicator next to each platform.
        safe(
          () =>
            prisma.socialAccount.findMany({
              where: { userId, isActive: true },
              select: {
                platform: true,
                tokenExpiry: true,
                updatedAt: true,
                lastError: true,
              },
            }),
          [],
        ),
      ])
    : [[], [], []];

  // Build a map: platform → connection-state for fast lookup in DraftCard.
  // Drives BOTH the stale-error detection AND the green-tick health
  // indicator next to each platform toggle.
  const accountStateByPlatform: Record<
    string,
    {
      tokenExpiry: Date | null;
      updatedAt: Date;
      lastError: string | null;
    }
  > = {};
  for (const a of socialAccounts) {
    accountStateByPlatform[a.platform] = {
      tokenExpiry: a.tokenExpiry,
      updatedAt: a.updatedAt,
      lastError: a.lastError,
    };
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl sm:text-4xl">
          Drafts &amp; <span className="font-italic-accent text-blush">queue.</span>
        </h1>
        <Link
          href="/compose?new=1"
          className="text-sm px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium"
        >
          New post
        </Link>
      </div>

      {/* ─── Recent generations ─────────────────────────────────
          Agent-created images live in MediaAsset, not on Draft. We surface
          them here so the user can see what was generated and one-click into
          /compose to wrap a draft around any of them. */}
      {recentMedia.length > 0 && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent generations</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Click any to start a new draft with it attached.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {recentMedia.map((m) => (
              <Link
                key={m.id}
                href={`/compose?mediaUrl=${encodeURIComponent(m.url)}`}
                className="group relative aspect-square rounded-lg overflow-hidden bg-[var(--color-surface-2)] border hover:border-[var(--color-accent)] transition-colors"
                title={m.prompt.slice(0, 200)}
              >
                {m.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbnailUrl ?? m.url}
                    alt={m.prompt.slice(0, 80)}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : m.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbnailUrl}
                    alt={m.prompt.slice(0, 80)}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center text-xs text-[var(--color-muted)]">
                    video
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white/90 line-clamp-2">
                    {m.prompt.slice(0, 80)}
                  </p>
                </div>
                <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider bg-black/60 text-white/90 rounded px-1.5 py-0.5">
                  {m.type.toLowerCase()}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Drafts list (active: DRAFT / SCHEDULED / APPROVED / PUBLISHING) ─── */}
      {(() => {
        const active = drafts.filter((d) =>
          ["DRAFT", "SCHEDULED", "APPROVED", "PUBLISHING"].includes(d.status),
        );
        const posted = drafts.filter((d) =>
          ["PUBLISHED", "FAILED"].includes(d.status),
        );

        function toCardData(d: (typeof drafts)[number]): DraftCardData {
          return {
            id: d.id,
            caption: d.caption,
            selectedHook: d.selectedHook,
            mediaUrl: d.mediaUrl,
            platforms: d.platforms,
            status: d.status,
            scheduledFor: d.scheduledFor,
            updatedAt: d.updatedAt,
            hashtags: d.hashtags,
            publishResults: Array.isArray(d.publishResults)
              ? (d.publishResults as DraftCardData["publishResults"])
              : null,
          };
        }

        return (
          <>
            <h2 className="text-lg font-semibold mb-3">
              Drafts & queue
              {active.length > 0 && (
                <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                  {active.length}
                </span>
              )}
            </h2>

            {active.length === 0 ? (
              <div className="border rounded-xl bg-[var(--color-surface)] p-10 text-center">
                <h3 className="text-base font-semibold mb-2">No drafts yet</h3>
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
                {active.map((d) => (
                  <DraftCard
                    key={d.id}
                    draft={toCardData(d)}
                    accountStateByPlatform={accountStateByPlatform}
                  />
                ))}
              </div>
            )}

            {/* ─── Posted (collapsed by default) ─────────────────── */}
            {posted.length > 0 && (
              <PostedSection
                drafts={posted.map(toCardData)}
                accountStateByPlatform={accountStateByPlatform}
              />
            )}
          </>
        );
      })()}
    </div>
  );
}
