import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { safe } from "@/lib/safe";
import { tryGetUser } from "@/lib/auth-helpers";
import { CarouselEditor } from "./carousel-editor";
import { CarouselTracker } from "./carousel-tracker";
import { parseMediaUrls } from "@/lib/media-urls";

export const metadata: Metadata = {
  title: "Carousel — Creator OS",
  description: "Create, schedule, and track carousel posts.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CarouselPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftParam } = await searchParams;
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  // Fetch carousel drafts — any draft with 2+ media URLs is a carousel
  const allDrafts = await safe(
    () =>
      prisma.draft.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    [],
  );

  const carouselDrafts = allDrafts
    .filter((d) => {
      const urls = parseMediaUrls(d.mediaUrl);
      return urls.length >= 2;
    })
    .map((d) => ({
      id: d.id,
      caption: d.caption,
      selectedHook: d.selectedHook,
      imageCount: parseMediaUrls(d.mediaUrl).length,
      firstImage: parseMediaUrls(d.mediaUrl)[0] ?? null,
      platforms: d.platforms,
      status: d.status,
      scheduledFor: d.scheduledFor?.toISOString() ?? null,
      updatedAt: d.updatedAt.toISOString(),
    }));

  // When ?draft=<id> is present, hydrate the editor with that saved carousel so
  // the user can open ("View"/edit) it from the Queue — not just publish/delete.
  const editing = draftParam ? allDrafts.find((d) => d.id === draftParam) : null;
  const initialDraft = editing
    ? (() => {
        const ho = (editing.hookOptions ?? {}) as Record<string, unknown>;
        const tm = (ho.trackerMeta ?? {}) as Record<string, unknown>;
        // The saved caption has "Comment <KEYWORD> for the full guide" appended
        // on save — strip it so editing doesn't double it up.
        const caption = (editing.caption ?? "")
          .replace(/\n+Comment\s+\S+\s+for the full guide\s*$/i, "")
          .trimEnd();
        return {
          id: editing.id,
          images: parseMediaUrls(editing.mediaUrl),
          caption,
          hashtags: editing.hashtags,
          keyword: typeof tm.cta_keyword === "string" ? tm.cta_keyword : "",
          botReply: typeof tm.cta_response === "string" ? tm.cta_response : "",
          platforms: editing.platforms,
        };
      })()
    : null;

  return (
    <div className="px-8 py-10 max-w-5xl">
      <h1 className="font-display text-3xl sm:text-4xl mb-6">
        Carousel <span className="font-italic-accent text-blush">posts.</span>
      </h1>

      {/* Tracker — saved/scheduled carousels */}
      {carouselDrafts.length > 0 && (
        <CarouselTracker drafts={carouselDrafts} />
      )}

      {/* Editor — create new, or edit the carousel from ?draft=<id> */}
      <div id="editor" className="mt-8 scroll-mt-6">
        <h2 className="text-lg font-semibold mb-4">
          {initialDraft ? "Edit carousel" : "New carousel"}
        </h2>
        <CarouselEditor key={draftParam ?? "new"} initialDraft={initialDraft} />
      </div>
    </div>
  );
}
