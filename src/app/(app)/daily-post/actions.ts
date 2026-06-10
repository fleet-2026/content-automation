"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { Platform, DraftStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { savePost, type GeneratedFields } from "./data";
import {
  listAllGuidesAdmin,
  setGuidePublished,
  updateGuide,
  deleteGuide,
} from "@/lib/guides";
import { generateVideoPromptText } from "@/lib/ai/video-prompt";
import { rateHookForVirality, type HookRating } from "@/lib/ai/rate-hook";
import { rateContentQuality, type ContentRating } from "@/lib/ai/rate-content";
import { publishDraft } from "@/lib/publish";
import type { PublishResult } from "@/lib/publish";
import { requireUser } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { uploadToR2 } from "@/lib/r2";
import { sniffFileType } from "@/lib/file-sniff";

export async function updatePost(
  slug: string,
  patch: Partial<GeneratedFields> & { body?: string },
) {
  // Normalize hashtags if provided as a string
  let p: Partial<GeneratedFields> & { body?: string } = { ...patch };
  if (typeof (patch as unknown as { hashtagsRaw?: string }).hashtagsRaw === "string") {
    const raw = (patch as unknown as { hashtagsRaw: string }).hashtagsRaw;
    p.hashtags = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("#") ? s : "#" + s));
    delete (p as unknown as { hashtagsRaw?: string }).hashtagsRaw;
  }
  const ok = await savePost(slug, p);
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/daily-post`);
  // Also revalidate the public page so body edits on a published guide
  // show up without waiting for the 5-min ISR cache to expire.
  revalidatePath(`/guides/${slug}`);
  return { ok };
}

/** Permanently delete a guide/post from the daily-post library. Used by
 *  the trash button on each card. Auth-gated; revalidates every surface
 *  the guide could appear on so it disappears immediately. */
export async function deletePost(
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  const ok = await deleteGuide(slug);
  if (!ok) return { ok: false, error: "Post not found (already deleted?)" };
  revalidatePath(`/daily-post`);
  revalidatePath(`/published`);
  revalidatePath(`/tracker`);
  revalidatePath(`/guides`);
  revalidatePath(`/guides/${slug}`);
  revalidatePath(`/sitemap.xml`);
  return { ok: true };
}

/** Single-guide publish/unpublish — used by the per-post editor toggle. */
export async function setPublished(slug: string, published: boolean) {
  const ok = await setGuidePublished(slug, published);
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/daily-post`);
  // /published filters on isPublished too — revalidate it so the post
  // shows up (or drops off) there immediately instead of serving a stale
  // client-cached page.
  revalidatePath(`/published`);
  revalidatePath(`/guides`);
  revalidatePath(`/guides/${slug}`);
  revalidatePath(`/sitemap.xml`);
  return { ok };
}

/** Bulk publish — flips every guide with a non-empty script to isPublished=true.
 *  Skips rows that are missing the script field (still placeholder content)
 *  so the public site doesn't show empty cards. */
export async function publishAllReady() {
  const all = await listAllGuidesAdmin();
  let published = 0;
  let skipped = 0;
  for (const g of all) {
    if (g.isPublished) continue;
    if (!g.script || !g.script.trim()) {
      skipped++;
      continue;
    }
    await setGuidePublished(g.slug, true);
    published++;
  }
  revalidatePath(`/daily-post`);
  revalidatePath(`/published`);
  revalidatePath(`/guides`);
  revalidatePath(`/sitemap.xml`);
  return { ok: true, published, skipped };
}

/** Generate a SCENES + VOICEOVER + CAPTIONS video brief for the guide
 *  by feeding its title + hook + script + body + caption to Claude.
 *  Saves the result to DailyGuide.videoPrompt and returns it so the
 *  client can show the new text without a page reload.
 *
 *  Gates: auth (admin user) + 20 generations/hour per user (Claude calls
 *  aren't free). */
export async function generateVideoPrompt(slug: string): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }

  const rl = await rateLimit(`video-prompt:${userId}`, {
    max: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Rate limit hit — try again in ${rl.retryAfterSec}s`,
    };
  }

  const guide = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: {
      title: true,
      hook: true,
      script: true,
      caption: true,
      body: true,
    },
  });
  if (!guide) return { ok: false, error: "guide_not_found" };
  if (!guide.script.trim() && !guide.hook.trim()) {
    return {
      ok: false,
      error: "Guide has no script or hook to derive a brief from",
    };
  }

  try {
    const text = await generateVideoPromptText({
      title: guide.title,
      hook: guide.hook,
      script: guide.script,
      caption: guide.caption,
      body: guide.body,
    });
    await prisma.dailyGuide.update({
      where: { slug },
      data: { videoPrompt: text },
    });
    revalidatePath(`/daily-post/${slug}`);
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Rate the guide's hook for virality and return rewrites the admin
 *  can swap in if the score is weak. No DB persistence — this is a
 *  pure analysis tool, called on-demand from the "Rate this post"
 *  button in the editor. */
export async function rateHook(slug: string): Promise<{
  ok: boolean;
  rating?: HookRating;
  error?: string;
}> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  const rl = await rateLimit(`rate-hook:${userId}`, {
    max: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Rate limit hit — try again in ${rl.retryAfterSec}s`,
    };
  }
  const guide = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: { title: true, hook: true, script: true, caption: true },
  });
  if (!guide) return { ok: false, error: "guide_not_found" };
  if (!guide.hook.trim()) {
    return { ok: false, error: "No hook to rate — fill in the Hook field first" };
  }
  try {
    const rating = await rateHookForVirality({
      title: guide.title,
      hook: guide.hook,
      script: guide.script,
      caption: guide.caption,
    });
    return { ok: true, rating };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Replace the guide's hook (one-click "Use this rewrite" from the
 *  rating panel). Saves to DailyGuide.hook + revalidates. */
export async function replaceHook(slug: string, newHook: string) {
  try {
    await requireUser();
  } catch {
    return { ok: false };
  }
  if (!newHook.trim()) return { ok: false };
  const ok = await updateGuide(slug, { hook: newHook.trim() });
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/guides/${slug}`);
  return { ok };
}

/** Rate the guide's script + caption quality. Returns per-dimension
 *  scores and 2 alternative captions the admin can swap in. */
export async function rateContent(slug: string): Promise<{
  ok: boolean;
  rating?: ContentRating;
  error?: string;
}> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }
  const rl = await rateLimit(`rate-content:${userId}`, {
    max: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Rate limit hit — try again in ${rl.retryAfterSec}s`,
    };
  }
  const guide = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: { title: true, hook: true, script: true, caption: true, hashtags: true },
  });
  if (!guide) return { ok: false, error: "guide_not_found" };
  if (!guide.script.trim() && !guide.caption.trim()) {
    return { ok: false, error: "Fill in the script or caption first" };
  }
  try {
    const rating = await rateContentQuality({
      title: guide.title,
      hook: guide.hook,
      script: guide.script,
      caption: guide.caption,
      hashtags: guide.hashtags,
    });
    // Persist scores so the tracker table can display them without re-running AI.
    await prisma.dailyGuide.update({
      where: { slug },
      data: {
        scriptScore: Math.round(rating.scriptScore),
        captionScore: Math.round(rating.captionScore),
      },
    });
    revalidatePath(`/daily-post`);
    revalidatePath(`/tracker`);
    return { ok: true, rating };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Manual save for the video-prompt textarea (after the admin edits the
 *  AI-generated brief). */
export async function saveVideoPrompt(slug: string, text: string) {
  try {
    await requireUser();
  } catch {
    return { ok: false };
  }
  const ok = await updateGuide(slug, { videoPrompt: text });
  revalidatePath(`/daily-post/${slug}`);
  return { ok };
}

/** Save or clear the ManyChat response file URL for a guide. */
export async function saveResponseUrl(slug: string, url: string | null) {
  try {
    await requireUser();
  } catch {
    return { ok: false };
  }
  const ok = await updateGuide(slug, { responseUrl: url || null });
  revalidatePath(`/daily-post/${slug}`);
  return { ok };
}

/** Save the custom ManyChat DM reply text for a guide. */
export async function saveResponseText(slug: string, text: string) {
  try {
    await requireUser();
  } catch {
    return { ok: false };
  }
  const ok = await updateGuide(slug, { responseText: text });
  revalidatePath(`/daily-post/${slug}`);
  return { ok };
}

/** Save media URLs for a guide. Either videoUrl, imageUrls, or both.
 *  Used by the post-editor's media upload section after /api/upload
 *  returns an R2 URL. */
export async function setMedia(
  slug: string,
  patch: { videoUrl?: string | null; imageUrls?: string[] },
) {
  const ok = await updateGuide(slug, patch);
  revalidatePath(`/daily-post/${slug}`);
  revalidatePath(`/daily-post`);
  revalidatePath(`/guides/${slug}`);
  return { ok };
}

/** Upload a file via Server Action (uses the 20 MB bodySizeLimit from
 *  next.config.ts — no Vercel 4.5 MB gateway limit, no R2 CORS needed).
 *  Returns { ok, url } on success or { ok: false, error } on failure. */
export async function uploadMedia(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }

  const rl = await rateLimit(`upload:${userId}`, {
    max: 50,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return { ok: false, error: "rate_limited" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "missing_file" };
  }
  if (file.size === 0) {
    return { ok: false, error: "empty_file" };
  }
  if (file.size > 200 * 1024 * 1024) {
    return { ok: false, error: "file_too_large (max 200 MB)" };
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffFileType(new Uint8Array(buf.slice(0, 64)));
    if (!sniffed) {
      return { ok: false, error: "unsupported_type" };
    }
    const key = `uploads/${userId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${sniffed.ext}`;
    const url = await uploadToR2(key, buf, sniffed.mime);
    return { ok: true, url };
  } catch (e) {
    console.error("[uploadMedia] failed:", e);
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

/** Publish to social platforms (Instagram, TikTok, Facebook) directly
 *  from the daily-post editor. Creates a Draft from the DailyGuide data,
 *  publishes it, and returns per-platform results.
 *
 *  The user picks which platforms to target. The guide must have a caption
 *  and at least a video or image to publish. */
export async function publishToSocial(
  slug: string,
  platforms: Platform[],
): Promise<{
  ok: boolean;
  results?: PublishResult[];
  error?: string;
}> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }

  const rl = await rateLimit(`social-publish:${userId}`, {
    max: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return { ok: false, error: `Rate limit hit — try again in ${rl.retryAfterSec}s` };
  }

  if (!platforms.length) {
    return { ok: false, error: "Pick at least one platform" };
  }

  const guide = await prisma.dailyGuide.findUnique({
    where: { slug },
    select: {
      title: true,
      caption: true,
      hashtags: true,
      hook: true,
      videoUrl: true,
      imageUrls: true,
    },
  });
  if (!guide) return { ok: false, error: "guide_not_found" };
  if (!guide.caption.trim()) {
    return { ok: false, error: "Caption is empty — fill it in first" };
  }

  // Build mediaUrl: video takes priority. If no video, newline-join
  // image URLs for carousel support. Draft.mediaUrl is a single string
  // with newlines for multi-image.
  let mediaUrl: string | null = null;
  if (guide.videoUrl) {
    mediaUrl = guide.videoUrl;
  } else if (guide.imageUrls.length > 0) {
    mediaUrl = guide.imageUrls.join("\n");
  }

  // Strip leading # from hashtags — Draft model stores bare tags,
  // combineCaption() in publish.ts re-adds the # prefix.
  const hashtags = guide.hashtags.map((h) =>
    h.startsWith("#") ? h.slice(1) : h,
  );

  try {
    // Create a Draft record that the publish pipeline expects.
    const draft = await prisma.draft.create({
      data: {
        userId,
        caption: guide.caption,
        hashtags,
        selectedHook: guide.hook || null,
        mediaUrl,
        platforms,
        status: DraftStatus.PUBLISHING,
      },
    });

    const results = await publishDraft(draft.id);

    // Save successfully-published platforms back to DailyGuide so the
    // list page can show IG/TT/FB badges. Merge with any previously
    // posted platforms (e.g. user published IG first, TT later).
    const successPlatforms = results
      .filter((r) => r.ok)
      .map((r) => r.platform);
    if (successPlatforms.length > 0) {
      const existing = await prisma.dailyGuide.findUnique({
        where: { slug },
        select: { postedPlatforms: true },
      });
      const merged = Array.from(
        new Set([...(existing?.postedPlatforms ?? []), ...successPlatforms]),
      );
      await prisma.dailyGuide.update({
        where: { slug },
        data: { postedPlatforms: merged },
      });
    }

    // The Draft was only scaffolding to drive publishDraft(). Delete it
    // ONLY when every targeted platform succeeded — a fully-published guide
    // already shows via postedPlatforms + Post rows, so the draft would be a
    // duplicate on /published. On ANY failure KEEP the draft: publishDraft
    // already marked it FAILED with the per-platform errors in publishResults,
    // so the error is preserved (we never lose a TikTok failure again) and the
    // post stays retryable from /drafts — publishDraft's skip-on-success logic
    // re-attempts only the failed platform. The /published page hides this
    // draft via the caption-match dedup either way, so no duplicate appears.
    const allOk = results.length > 0 && results.every((r) => r.ok);
    if (allOk) {
      await prisma.draft.delete({ where: { id: draft.id } }).catch(() => {});
    }

    revalidatePath(`/daily-post/${slug}`);
    revalidatePath(`/daily-post`);
    // A successful social post counts as "published" (postedPlatforms is
    // now non-empty) so the post moves to /published — revalidate it so it
    // actually appears there without a stale-cache delay.
    revalidatePath(`/published`);
    revalidatePath(`/drafts`);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Check the health of connected social accounts by testing each token
 *  against the platform's API. Returns per-platform status + scopes so
 *  the publish section can show which accounts are ready. */
export async function checkAccountHealth(): Promise<{
  accounts: {
    platform: string;
    ok: boolean;
    detail: string;
    scopes?: string[];
  }[];
}> {
  const { decrypt } = await import("@/lib/crypto");
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { accounts: [] };
  }
  const dbAccounts = await prisma.socialAccount.findMany({
    where: { userId, isActive: true, platform: { in: ["INSTAGRAM", "TIKTOK", "FACEBOOK"] } },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, refreshToken: true, tokenExpiry: true },
  });
  const results = await Promise.all(
    dbAccounts.map(async (acct) => {
      const token = decrypt(acct.accessToken);
      if (acct.platform === "INSTAGRAM" || acct.platform === "FACEBOOK") {
        try {
          const debugParams = new URLSearchParams({
            input_token: token,
            access_token: token,
          });
          const r = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?${debugParams.toString()}`,
          );
          const j = (await r.json()) as {
            data?: { is_valid?: boolean; scopes?: string[]; error?: { message?: string } };
          };
          const scopes = j.data?.scopes ?? [];
          if (j.data?.is_valid) {
            // For Instagram, specifically check that instagram_content_publish
            // is in the granted scopes — without it, the publish call will
            // fail with "Authorization Error code 100 subcode 33" even though
            // the token itself is valid.
            const missingPublish =
              acct.platform === "INSTAGRAM" &&
              !scopes.includes("instagram_content_publish");
            return {
              platform: acct.platform,
              ok: !missingPublish,
              detail: missingPublish
                ? "Missing instagram_content_publish scope — reconnect from /dashboard"
                : `Valid (${acct.platformUserId})`,
              scopes,
            };
          }
          return {
            platform: acct.platform,
            ok: false,
            detail: j.data?.error?.message ?? "Token invalid",
            scopes,
          };
        } catch (e) {
          return { platform: acct.platform, ok: false, detail: (e as Error).message };
        }
      }
      if (acct.platform === "TIKTOK") {
        const expired = acct.tokenExpiry ? acct.tokenExpiry < new Date() : false;
        if (expired && acct.refreshToken) {
          // Auto-refresh the expired TikTok token
          try {
            const { tiktokRefresh } = await import("@/lib/platforms/tiktok");
            const rt = decrypt(acct.refreshToken);
            const fresh = await tiktokRefresh(rt);
            const { encrypt } = await import("@/lib/crypto");
            await prisma.socialAccount.update({
              where: { id: acct.id },
              data: {
                accessToken: encrypt(fresh.accessToken),
                refreshToken: encrypt(fresh.refreshToken),
                tokenExpiry: fresh.expiresAt,
                lastError: null,
              },
            });
            return {
              platform: "TIKTOK",
              ok: true,
              detail: `Refreshed — valid until ${fresh.expiresAt.toISOString()}`,
            };
          } catch (e) {
            return {
              platform: "TIKTOK",
              ok: false,
              detail: `Refresh failed: ${(e as Error).message}`,
            };
          }
        }
        return {
          platform: "TIKTOK",
          ok: !expired,
          detail: expired
            ? `Token expired — no refresh token, reconnect from /dashboard`
            : `Valid until ${acct.tokenExpiry?.toISOString() ?? "unknown"}`,
        };
      }
      return { platform: acct.platform, ok: false, detail: "Unknown platform" };
    }),
  );
  return { accounts: results };
}

/** Bulk unpublish — flips every published guide back to draft. */
export async function unpublishAll() {
  const all = await listAllGuidesAdmin();
  let unpublished = 0;
  for (const g of all) {
    if (!g.isPublished) continue;
    await setGuidePublished(g.slug, false);
    unpublished++;
  }
  revalidatePath(`/daily-post`);
  revalidatePath(`/published`);
  revalidatePath(`/guides`);
  revalidatePath(`/sitemap.xml`);
  return { ok: true, unpublished };
}

/** Build a time-limited URL for the mobile TikTok caption page. */
export async function getTikTokCaptionUrl(slug: string): Promise<string> {
  // Import from the shared lib, NOT from the route handler — importing a
  // non-handler export out of a Next.js route.ts returns undefined in
  // production, which silently broke QR-code generation (the call threw
  // and the editor swallowed it, so no QR appeared).
  const { captionHmac } = await import("@/lib/tt-caption");
  const { h, t } = captionHmac(slug);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://creator-os-delta.vercel.app";
  return `${base}/api/tt-caption?slug=${encodeURIComponent(slug)}&h=${h}&t=${t}`;
}
