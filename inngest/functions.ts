import { inngest } from "./client";
import { Platform, TranscriptSource } from "@prisma/client";
import { prisma } from "@/lib/db";
import { syncAccount } from "@/lib/sync";
import { fetchYoutubeTranscript } from "@/lib/youtube-transcript";
import { extractHook } from "@/lib/ai/hook-extractor";
import { embed, toPgVector } from "@/lib/ai/embed";
import { scrapeAndIngest } from "@/lib/competitors/ingest";
import { transcribeUrl } from "@/lib/ai/transcribe";
import { ingestNicheNews } from "@/lib/news";
import { generateMorningBrief } from "@/lib/brief";
import { publishDraft } from "@/lib/publish";

// ─── Sync MY posts every 6h ───────────────────────────────────

export const syncMyPosts = inngest.createFunction(
  { id: "sync-my-posts", name: "Sync my posts (IG / YT / TikTok)" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const accounts = await step.run("list-accounts", () =>
      prisma.socialAccount.findMany({ where: { isActive: true }, select: { id: true } }),
    );
    for (const a of accounts) {
      await step.sendEvent(`sync-${a.id}`, {
        name: "creator-os/sync.account",
        data: { socialAccountId: a.id },
      });
    }
    return { triggered: accounts.length };
  },
);

export const syncOneAccount = inngest.createFunction(
  { id: "sync-one-account", name: "Sync one social account", concurrency: 4 },
  { event: "creator-os/sync.account" },
  async ({ event, step }) => {
    const { socialAccountId } = event.data as { socialAccountId: string };
    const result = await step.run("pull-and-upsert", () => syncAccount(socialAccountId));
    for (const postId of result.newPostIds) {
      await step.sendEvent(`enrich-${postId}`, {
        name: "creator-os/post.enrich",
        data: { postId },
      });
    }
    return result;
  },
);

// ─── Per-post enrichment: transcript + hook ──────────────────

export const enrichPost = inngest.createFunction(
  { id: "enrich-post", name: "Transcribe + extract hook", concurrency: 6 },
  { event: "creator-os/post.enrich" },
  async ({ event, step }) => {
    const { postId } = event.data as { postId: string };
    const post = await step.run("load-post", () =>
      prisma.post.findUnique({ where: { id: postId } }),
    );
    if (!post) return { skipped: "no_post" };

    let transcriptText: string | null = null;

    if (post.platform === Platform.YOUTUBE) {
      const yt = await step.run("yt-transcript", () =>
        fetchYoutubeTranscript(post.platformPostId),
      );
      if (yt?.text) {
        transcriptText = yt.text;
        await step.run("save-yt-transcript", async () => {
          const vec = await embed(yt.text.slice(0, 6000));
          await prisma.transcript.upsert({
            where: { postId: post.id },
            create: {
              postId: post.id,
              text: yt.text,
              segments: yt.segments,
              source: TranscriptSource.PLATFORM_CAPTIONS,
              durationSec: yt.durationSec ?? null,
            },
            update: { text: yt.text, segments: yt.segments },
          });
          await prisma.$executeRawUnsafe(
            `UPDATE transcripts SET embedding = $1::vector WHERE "postId" = $2`,
            toPgVector(vec),
            post.id,
          );
        });
      }
    } else if ((post.platform === Platform.TIKTOK || post.platform === Platform.INSTAGRAM) && post.mediaUrl) {
      // Whisper for IG Reels / TikTok
      try {
        const t = await step.run("whisper", () => transcribeUrl(post.mediaUrl!));
        if (t.text) {
          transcriptText = t.text;
          await step.run("save-whisper-transcript", async () => {
            const vec = await embed(t.text.slice(0, 6000));
            await prisma.transcript.upsert({
              where: { postId: post.id },
              create: {
                postId: post.id,
                text: t.text,
                segments: (t.segments ?? []) as object,
                source: TranscriptSource.WHISPER,
                durationSec: t.durationSec ?? null,
              },
              update: { text: t.text, segments: (t.segments ?? []) as object },
            });
            await prisma.$executeRawUnsafe(
              `UPDATE transcripts SET embedding = $1::vector WHERE "postId" = $2`,
              toPgVector(vec),
              post.id,
            );
          });
        }
      } catch {
        // If we can't reach the media URL or Whisper fails, fall through to caption-only hook.
      }
    }

    const extracted = await step.run("extract-hook", () =>
      extractHook({ caption: post.caption, transcript: transcriptText }),
    );

    if (extracted.hookText) {
      const hookId = await step.run("upsert-hook", async () => {
        const vec = await embed(extracted.hookText);
        const existing = await prisma.$queryRawUnsafe<{ id: string; distance: number }[]>(
          `SELECT id, embedding <=> $1::vector AS distance
             FROM hooks
            WHERE "ownerType" = 'MINE'
            ORDER BY embedding <=> $1::vector
            LIMIT 1`,
          toPgVector(vec),
        );
        const reuse = existing[0] && existing[0].distance < 0.15 ? existing[0].id : null;
        if (reuse) {
          await prisma.hook.update({ where: { id: reuse }, data: { uses: { increment: 1 } } });
          return reuse;
        }
        const created = await prisma.hook.create({
          data: { text: extracted.hookText, pattern: extracted.pattern, ownerType: "MINE", uses: 1 },
          select: { id: true },
        });
        await prisma.$executeRawUnsafe(
          `UPDATE hooks SET embedding = $1::vector WHERE id = $2`,
          toPgVector(vec),
          created.id,
        );
        return created.id;
      });

      await step.run("attach-hook", () =>
        prisma.post.update({
          where: { id: post.id },
          data: {
            hookText: extracted.hookText,
            hookId,
            topic: extracted.topic,
            conceptTags: extracted.conceptTags,
          },
        }),
      );
    }

    return { ok: true };
  },
);

// ─── Competitor scraping (Phase 3) ──────────────────────────

export const scrapeCompetitorsCron = inngest.createFunction(
  { id: "scrape-competitors-cron", name: "Daily scrape watched creators" },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const creators = await step.run("list", () =>
      prisma.creator.findMany({ where: { isWatching: true }, select: { id: true } }),
    );
    for (const c of creators) {
      await step.sendEvent(`scrape-${c.id}`, {
        name: "creator-os/competitor.scrape",
        data: { creatorId: c.id },
      });
    }
    return { triggered: creators.length };
  },
);

export const scrapeOneCreator = inngest.createFunction(
  { id: "scrape-one-creator", name: "Scrape one creator", concurrency: 3 },
  { event: "creator-os/competitor.scrape" },
  async ({ event, step }) => {
    const { creatorId } = event.data as { creatorId: string };
    const result = await step.run("scrape-and-ingest", () => scrapeAndIngest(creatorId));
    for (const id of result.newIds) {
      await step.sendEvent(`enrich-cp-${id}`, {
        name: "creator-os/competitor.enrich",
        data: { competitorPostId: id },
      });
    }
    return result;
  },
);

export const enrichCompetitorPost = inngest.createFunction(
  { id: "enrich-competitor-post", name: "Transcribe + extract hook (competitor)", concurrency: 4 },
  { event: "creator-os/competitor.enrich" },
  async ({ event, step }) => {
    const { competitorPostId } = event.data as { competitorPostId: string };
    const cp = await step.run("load", () =>
      prisma.competitorPost.findUnique({ where: { id: competitorPostId } }),
    );
    if (!cp) return { skipped: "no_post" };

    let transcriptText: string | null = null;

    if (cp.platform === Platform.YOUTUBE) {
      const yt = await step.run("yt-transcript", () => fetchYoutubeTranscript(cp.platformPostId));
      if (yt?.text) {
        transcriptText = yt.text;
        await step.run("save-yt", async () => {
          const vec = await embed(yt.text.slice(0, 6000));
          await prisma.transcript.upsert({
            where: { competitorPostId: cp.id },
            create: {
              competitorPostId: cp.id,
              text: yt.text,
              segments: yt.segments,
              source: TranscriptSource.PLATFORM_CAPTIONS,
              durationSec: yt.durationSec ?? null,
            },
            update: { text: yt.text, segments: yt.segments },
          });
          await prisma.$executeRawUnsafe(
            `UPDATE transcripts SET embedding = $1::vector WHERE "competitorPostId" = $2`,
            toPgVector(vec),
            cp.id,
          );
        });
      }
    } else if (cp.mediaUrl) {
      try {
        const t = await step.run("whisper-cp", () => transcribeUrl(cp.mediaUrl!));
        if (t.text) {
          transcriptText = t.text;
          await step.run("save-whisper-cp", async () => {
            const vec = await embed(t.text.slice(0, 6000));
            await prisma.transcript.upsert({
              where: { competitorPostId: cp.id },
              create: {
                competitorPostId: cp.id,
                text: t.text,
                segments: (t.segments ?? []) as object,
                source: TranscriptSource.WHISPER,
                durationSec: t.durationSec ?? null,
              },
              update: { text: t.text, segments: (t.segments ?? []) as object },
            });
            await prisma.$executeRawUnsafe(
              `UPDATE transcripts SET embedding = $1::vector WHERE "competitorPostId" = $2`,
              toPgVector(vec),
              cp.id,
            );
          });
        }
      } catch {
        // soft-fail
      }
    }

    const extracted = await step.run("extract-hook", () =>
      extractHook({ caption: cp.caption, transcript: transcriptText }),
    );

    if (extracted.hookText) {
      const hookId = await step.run("upsert-niche-hook", async () => {
        const vec = await embed(extracted.hookText);
        const existing = await prisma.$queryRawUnsafe<{ id: string; distance: number }[]>(
          `SELECT id, embedding <=> $1::vector AS distance
             FROM hooks
            WHERE "ownerType" = 'NICHE'
            ORDER BY embedding <=> $1::vector
            LIMIT 1`,
          toPgVector(vec),
        );
        const reuse = existing[0] && existing[0].distance < 0.12 ? existing[0].id : null;
        if (reuse) {
          await prisma.hook.update({ where: { id: reuse }, data: { uses: { increment: 1 } } });
          return reuse;
        }
        const created = await prisma.hook.create({
          data: { text: extracted.hookText, pattern: extracted.pattern, ownerType: "NICHE", uses: 1 },
          select: { id: true },
        });
        await prisma.$executeRawUnsafe(
          `UPDATE hooks SET embedding = $1::vector WHERE id = $2`,
          toPgVector(vec),
          created.id,
        );
        return created.id;
      });

      await step.run("attach", () =>
        prisma.competitorPost.update({
          where: { id: cp.id },
          data: {
            hookText: extracted.hookText,
            hookId,
            topic: extracted.topic,
            conceptTags: extracted.conceptTags,
          },
        }),
      );
    }
    return { ok: true };
  },
);

// ─── Niche news + morning brief (Phase 4) ───────────────────

export const pullNicheNews = inngest.createFunction(
  { id: "pull-niche-news", name: "Pull niche news (Tavily)" },
  { cron: "0 7 * * *" },
  async ({ step }) => {
    const users = await step.run("users", () =>
      prisma.user.findMany({ where: { niche: { not: null } }, select: { id: true, niche: true } }),
    );
    let total = 0;
    for (const u of users) {
      if (!u.niche) continue;
      const n = await step.run(`tavily-${u.id}`, () => ingestNicheNews(u.niche!));
      total += n;
    }
    return { inserted: total };
  },
);

export const morningBrief = inngest.createFunction(
  { id: "morning-brief", name: "Generate morning brief" },
  { cron: "0 13 * * *" }, // 13:00 UTC = 7am Central
  async ({ step }) => {
    const users = await step.run("users", () =>
      prisma.user.findMany({ select: { id: true } }),
    );
    for (const u of users) {
      await step.run(`brief-${u.id}`, async () => {
        const brief = await generateMorningBrief(u.id);
        await prisma.auditLog.create({
          data: { action: "morning-brief.generated", target: u.id, status: "success", details: brief as object },
        });
      });
    }
    return { generated: users.length };
  },
);

// ─── Recompute hook stats nightly ───────────────────────────

export const recomputeHookStats = inngest.createFunction(
  { id: "recompute-hook-stats", name: "Recompute hook engagement averages" },
  { cron: "0 5 * * *" },
  async ({ step }) => {
    await step.run("recompute", async () => {
      await prisma.$executeRawUnsafe(`
        UPDATE hooks h
           SET "avgEngagementRate" = sub.avg_er,
               "uses" = sub.uses,
               "bestPostViews" = sub.best_views,
               "bestPostId" = sub.best_id
          FROM (
            SELECT "hookId" AS id,
                   AVG("engagementRate") AS avg_er,
                   COUNT(*)::int AS uses,
                   MAX(views) AS best_views,
                   (ARRAY_AGG(id ORDER BY views DESC))[1] AS best_id
              FROM posts
             WHERE "hookId" IS NOT NULL
             GROUP BY "hookId"
          ) sub
         WHERE sub.id = h.id;
      `);
    });
    return { ok: true };
  },
);

// ─── Scheduled-draft publisher ──────────────────────────────

export const publishScheduledDraft = inngest.createFunction(
  { id: "publish-scheduled-draft", name: "Publish a scheduled draft" },
  { event: "creator-os/draft.schedule" },
  async ({ event, step }) => {
    const { draftId, runAt } = event.data as { draftId: string; runAt: string };
    await step.sleepUntil("until-time", new Date(runAt));
    const result = await step.run("publish", () => publishDraft(draftId));
    return { result };
  },
);

export const publishDuePollers = inngest.createFunction(
  { id: "publish-due-pollers", name: "Publish drafts due (safety net)" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const due = await step.run("scan", () =>
      prisma.draft.findMany({
        where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
        select: { id: true },
        take: 25,
      }),
    );
    for (const d of due) {
      await step.run(`pub-${d.id}`, () => publishDraft(d.id));
    }
    return { published: due.length };
  },
);

export const functions = [
  syncMyPosts,
  syncOneAccount,
  enrichPost,
  scrapeCompetitorsCron,
  scrapeOneCreator,
  enrichCompetitorPost,
  pullNicheNews,
  morningBrief,
  recomputeHookStats,
  publishScheduledDraft,
  publishDuePollers,
];
