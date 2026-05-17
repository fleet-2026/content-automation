import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { ScheduleUI, type ScheduledItem } from "./schedule-ui";
import {
  DEMO,
  demoScheduled,
  demoRecurringSlots,
  demoAutomations,
} from "@/lib/demo-data";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const userId = (await tryGetUser()) ?? undefined;

  // Fetch every draft that's relevant to the next 14 days:
  //  - SCHEDULED with scheduledFor in the window → solid scheduled cards
  //  - DRAFT / FAILED with scheduledFor set → still on the calendar, shown
  //    with their actual status so the user can see what's queued vs broken
  //  - DRAFT without scheduledFor → not on the calendar (lives on /drafts)
  //
  // Two-week horizon mirrors the UI window. Past-due drafts (scheduledFor
  // already passed but not yet PUBLISHED) are pulled into "today" so the
  // user notices the backlog instead of it disappearing off-screen.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const horizon = new Date(startOfToday);
  horizon.setDate(horizon.getDate() + 14);

  const realDrafts = userId
    ? await safe(
        () =>
          prisma.draft.findMany({
            where: {
              userId,
              scheduledFor: { not: null, lt: horizon },
              status: { in: ["SCHEDULED", "DRAFT", "FAILED", "PUBLISHING"] },
            },
            orderBy: { scheduledFor: "asc" },
            select: {
              id: true,
              caption: true,
              selectedHook: true,
              mediaUrl: true,
              platforms: true,
              status: true,
              scheduledFor: true,
            },
          }),
        [],
        "schedule:drafts",
      )
    : [];

  const realScheduled: ScheduledItem[] = realDrafts
    .filter((d): d is typeof d & { scheduledFor: Date } => d.scheduledFor !== null)
    .map((d) => ({
      id: d.id,
      isReal: true,
      scheduledAt: d.scheduledFor,
      hookText: d.selectedHook ?? "",
      caption: d.caption,
      mediaUrl: d.mediaUrl,
      platforms: d.platforms.filter(
        (p): p is "INSTAGRAM" | "TIKTOK" | "YOUTUBE" =>
          p === "INSTAGRAM" || p === "TIKTOK" || p === "YOUTUBE",
      ),
      status: d.status,
      mediaType: d.mediaUrl
        ? /\.(mp4|mov|m4v|webm)(\?|$)/i.test(d.mediaUrl)
          ? "VIDEO"
          : "IMAGE"
        : "TEXT",
    }));

  // Show demo data only as a placeholder when the user has zero real scheduled
  // drafts AND DEMO_MODE is on. The moment they schedule one real post, the
  // demo disappears so they can't get confused about which is which.
  const shouldShowDemo = realScheduled.length === 0 && DEMO;
  const scheduled: ScheduledItem[] = shouldShowDemo
    ? demoScheduled.map((d) => ({
        id: d.id,
        isReal: false, // hides edit/publish buttons on demo cards
        scheduledAt: d.scheduledAt,
        hookText: d.hookText,
        caption: d.caption,
        mediaUrl: null,
        platforms: d.platforms,
        status: d.status,
        mediaType: d.mediaType,
      }))
    : realScheduled;

  const recurring = DEMO ? demoRecurringSlots : [];
  const automations = DEMO ? demoAutomations : [];

  return (
    <div className="px-8 py-10 max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">Schedule &amp; automations</h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Your posting calendar, recurring slots, and every background job running
        on your behalf.
      </p>
      {shouldShowDemo && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-lg px-4 py-3">
          <strong>Demo data shown.</strong> You don&apos;t have any scheduled
          drafts yet. Schedule a real post from{" "}
          <a href="/compose" className="underline font-medium">
            /compose
          </a>{" "}
          and it&apos;ll replace this placeholder calendar.
        </div>
      )}
      <ScheduleUI
        scheduled={scheduled}
        recurring={recurring}
        automations={automations}
      />
    </div>
  );
}
