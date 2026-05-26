import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { tryGetUser } from "@/lib/auth-helpers";
import { readTrackerMeta } from "./meta";
import SeedButton from "./seed-button";
import TrackerRow from "./tracker-row";
import { trackerSeedData } from "./seed-data";

export const metadata: Metadata = {
  title: "31-day Tracker — Creator OS",
  description: "All 31 daily Claude posts in one view. Track posting + ManyChat status.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const drafts = await prisma.draft.findMany({
    where: { userId },
    select: {
      id: true,
      caption: true,
      selectedHook: true,
      mediaUrl: true,
      platforms: true,
      status: true,
      hookOptions: true,
    },
  });

  // Filter to drafts that belong to the 31-day series
  const rows = drafts
    .map((d) => ({ ...d, meta: readTrackerMeta(d.hookOptions) }))
    .filter((d) => d.meta?.dayNumber !== undefined)
    .sort((a, b) => (a.meta!.dayNumber ?? 999) - (b.meta!.dayNumber ?? 999));

  const wiredCount = rows.filter((r) => r.meta?.manychatWired).length;
  const postedCount = rows.filter((r) => !!r.meta?.igPostUrl).length;
  const total = trackerSeedData.length;

  return (
    <div className="px-8 py-10 max-w-7xl">
      <div className="mb-8 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            31-day <span className="font-italic-accent text-blush">tracker.</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {rows.length} of {total} posts · {postedCount} posted · {wiredCount} ManyChat-wired
          </p>
        </div>
        <SeedButton />
      </div>

      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200 leading-relaxed">
        <strong>How this works.</strong> One card per day, each one a Draft
        targeting your connected platforms.{" "}
        <ol className="mt-2 ml-4 list-decimal space-y-1 text-xs text-amber-100/80">
          <li>Click <em>Seed all 31 days</em> once to load every day as a Draft.</li>
          <li>Click the image area to upload your talking head photo/video.</li>
          <li>Click <strong>Post all →</strong> to publish to Instagram, Facebook, TikTok, LinkedIn in one go.</li>
          <li>Paste the IG post URL, wire your ManyChat keyword + DM text, tick <strong>Wired</strong>.</li>
        </ol>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
          <h2 className="text-base font-medium mb-2">No rows yet.</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Click <strong>Seed all 31 days</strong> above to load every daily post as a Draft.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((r) => (
            <TrackerRow
              key={r.id}
              draftId={r.id}
              caption={r.caption}
              hook={r.selectedHook}
              mediaUrl={r.mediaUrl}
              platforms={r.platforms}
              status={r.status}
              meta={r.meta!}
            />
          ))}
        </div>
      )}

      <div className="mt-8 text-xs text-[var(--color-muted)] leading-relaxed">
        <p><strong>Badge colors:</strong></p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>Gray → not posted yet, no IG URL</li>
          <li>Amber → posted on IG, ManyChat not wired yet</li>
          <li>Green → posted on IG, ManyChat live, full loop active</li>
        </ul>
      </div>
    </div>
  );
}
