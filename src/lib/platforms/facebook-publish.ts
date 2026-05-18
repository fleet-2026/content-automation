import { env } from "@/lib/env";

/**
 * Facebook Page publishing.
 *
 * Three modes the Graph API exposes for a Page:
 *   - Text-only post   → POST /{page-id}/feed         body: { message }
 *   - Photo post       → POST /{page-id}/photos       body: { url, caption }
 *   - Video post       → POST /{page-id}/videos       body: { file_url, description }
 *
 * Carousels (multiple images in one post) are technically possible on FB
 * via "scheduled photo posts" or unpublished photos + a Page post that
 * references them, but the workflow is multi-step and rarely used. For
 * now we publish the primary image only; full carousel-on-FB is a future
 * enhancement on the same publish.ts pivot we already have.
 *
 * The `accessToken` argument is the PAGE access token (not the user
 * access token). It comes from /me/accounts during connect — see
 * facebook.ts → facebookListPages — and gets persisted (encrypted) on
 * the SocialAccount row.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type FBPublishResult = {
  platformPostId: string;
  permalink?: string;
};

export async function fbPublish(
  pageId: string,
  pageAccessToken: string,
  input: {
    message: string;
    imageUrl?: string;
    videoUrl?: string;
  },
): Promise<FBPublishResult> {
  // Validate args eagerly — Meta's error messages on bad inputs are
  // notoriously cryptic ("(#100) Param ... required"), so we precheck.
  if (!pageId || !pageAccessToken) {
    throw new Error("fbPublish: missing pageId or pageAccessToken");
  }
  if (!input.message?.trim() && !input.imageUrl && !input.videoUrl) {
    throw new Error("fbPublish: nothing to post (no message, image, or video)");
  }

  // Branch on media type. We prefer media-with-caption when an image or
  // video is present; otherwise it's a plain text/feed post.
  if (input.videoUrl) {
    const endpoint = `${GRAPH}/${pageId}/videos`;
    const body = new URLSearchParams({
      file_url: input.videoUrl,
      description: input.message ?? "",
      access_token: pageAccessToken,
    });
    const res = await safePost(endpoint, body);
    return { platformPostId: res.id, permalink: extractPermalink(res) };
  }

  if (input.imageUrl) {
    const endpoint = `${GRAPH}/${pageId}/photos`;
    const body = new URLSearchParams({
      url: input.imageUrl,
      caption: input.message ?? "",
      access_token: pageAccessToken,
    });
    const res = await safePost(endpoint, body);
    // /photos returns both `id` (photo id) and `post_id` (the
    // containing feed-post id). For the SocialAccount log + Posts table
    // we want the post_id so analytics later can fetch insights.
    return {
      platformPostId: res.post_id ?? res.id,
      permalink: extractPermalink(res),
    };
  }

  // Text-only feed post.
  const endpoint = `${GRAPH}/${pageId}/feed`;
  const body = new URLSearchParams({
    message: input.message,
    access_token: pageAccessToken,
  });
  const res = await safePost(endpoint, body);
  return { platformPostId: res.id, permalink: extractPermalink(res) };
}

/**
 * 30s POST with body validation. Meta sometimes returns 200 with an
 * `error` field instead of a non-2xx status, so we treat any `error`
 * key as a thrown failure.
 */
async function safePost(
  url: string,
  body: URLSearchParams,
): Promise<{ id: string; post_id?: string; permalink_url?: string; error?: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("FB publish: timeout after 30s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`FB publish: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    id?: string;
    post_id?: string;
    permalink_url?: string;
    error?: { message?: string; code?: number };
  };
  if (json.error) {
    throw new Error(
      `FB publish error: ${json.error.message ?? "unknown"} (code ${json.error.code ?? "?"})`,
    );
  }
  if (typeof json.id !== "string") {
    throw new Error("FB publish: malformed response (no id)");
  }
  return json as { id: string; post_id?: string; permalink_url?: string };
}

function extractPermalink(res: {
  id?: string;
  post_id?: string;
  permalink_url?: string;
}): string | undefined {
  if (res.permalink_url) return res.permalink_url;
  // FB doesn't always return permalink_url; we can synthesize one from
  // the post_id (or id) but it's a `business.facebook.com` lookup URL,
  // not a clean public URL. Skip rather than return a wrong link.
  return undefined;
}

// Re-export META_APP_ID check helper so callers can validate env quickly.
export function isFacebookConfigured(): boolean {
  return !!env("META_APP_ID") && !!env("META_APP_SECRET");
}
