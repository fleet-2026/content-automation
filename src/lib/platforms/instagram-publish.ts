/**
 * Instagram publishing via Graph API.
 *
 * Two-step flow:
 *  1. POST /{ig-user-id}/media         → returns container id
 *  2. POST /{ig-user-id}/media_publish → publishes the container
 *
 * For Reels/Video: retry the publish call until the container is
 * processed. The GET /{container-id}?fields=status_code polling
 * endpoint is unreliable (returns 400 "Authorization Error" on
 * some token configurations), so we skip it and try to publish
 * directly — Meta returns a clear "media is not ready" error when
 * the video is still processing, which we catch and retry.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/** Build a Graph API GET URL with properly-encoded access_token. */
function graphGet(path: string, fields: string, token: string): string {
  const p = new URLSearchParams({ fields, access_token: token });
  return `${GRAPH}/${path}?${p.toString()}`;
}

/** Wrap a public image URL through the weserv.nl smart-crop proxy so
 *  Instagram receives a 4:5 (1080×1350) feed-safe portrait. Without this,
 *  9:16 source images get center-cropped by Instagram itself — chopping the
 *  top of the face when the subject sits high in the frame.
 *
 *  weserv `a=top` anchors the crop to the top of the image so the head
 *  stays in frame for portrait / talking-head content.
 *
 *  Video URLs pass through unchanged (weserv doesn't transcode video). */
function safeIgImageUrl(rawUrl: string): string {
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("https://images.weserv.nl/")) return rawUrl;
  const upstream = rawUrl.replace(/^https?:\/\//i, "");
  return (
    "https://images.weserv.nl/?url=" +
    encodeURIComponent(upstream) +
    "&w=1080&h=1350&fit=cover&a=top&output=jpg&q=90"
  );
}

export type IGPublishInput = {
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  isReel?: boolean;
  imageUrls?: string[];
};

/**
 * Try to publish a container. Uses a hard deadline instead of fixed
 * attempt counts so the outer retry loop can share the same 48s budget.
 *
 * Returns the published media ID or throws when time runs out.
 */
async function publishWithRetry(
  igBusinessId: string,
  containerId: string,
  accessToken: string,
  isVideo: boolean,
  /** Epoch ms — stop retrying after this point. */
  deadline: number,
): Promise<{ id: string }> {
  const delayMs = isVideo ? 4000 : 3000;
  const initialDelay = isVideo ? 3000 : 2000;

  // Wait before the first attempt so IG can fetch + process the media.
  await sleep(initialDelay);

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    if (attempt > 1) {
      await sleep(delayMs);
      // Re-check deadline after sleeping
      if (Date.now() >= deadline) break;
    }

    const pubRes = await fetch(`${GRAPH}/${igBusinessId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    if (pubRes.ok) {
      const pub = (await pubRes.json()) as { id: string };
      console.log(`[ig-publish] published on attempt ${attempt}: ${pub.id}`);
      return pub;
    }

    const body = await pubRes.text();
    const bodyLower = body.toLowerCase();

    const isNotReady =
      bodyLower.includes("not ready") ||
      bodyLower.includes("not yet ready") ||
      bodyLower.includes("being processed") ||
      bodyLower.includes("media is not") ||
      bodyLower.includes("media id is not") ||
      bodyLower.includes("in_progress") ||
      bodyLower.includes("published") ||
      pubRes.status === 400;

    if (isNotReady) {
      console.log(
        `[ig-publish] attempt ${attempt}: not ready (${pubRes.status}), ` +
        `${Math.round((deadline - Date.now()) / 1000)}s left`,
      );
      continue;
    }

    // Fatal / non-retryable error
    throw new Error(`IG publish: ${pubRes.status} ${body}`);
  }

  throw new Error(
    `IG publish: deadline reached after ${attempt} attempts`,
  );
}

/**
 * Create a single-item container and return its ID.
 * Separated so we can recreate on failure (outer retry).
 */
async function createSingleContainer(
  igBusinessId: string,
  pageAccessToken: string,
  input: IGPublishInput,
  /** When true, send the raw image URL without the weserv proxy. */
  skipProxy?: boolean,
): Promise<string> {
  const params = new URLSearchParams({ access_token: pageAccessToken });
  if (input.caption) params.set("caption", input.caption);

  if (input.videoUrl) {
    params.set("media_type", input.isReel ? "REELS" : "VIDEO");
    params.set("video_url", input.videoUrl);
    if (input.thumbnailUrl) params.set("thumb_offset", "0");
  } else if (input.imageUrl) {
    params.set(
      "image_url",
      skipProxy ? input.imageUrl : safeIgImageUrl(input.imageUrl),
    );
  } else {
    throw new Error("igPublish requires imageUrl, videoUrl, or imageUrls[]");
  }

  console.log(
    `[ig-publish] creating container: igBusinessId=${igBusinessId} media_type=${params.get("media_type")} skipProxy=${!!skipProxy}`,
  );
  const createRes = await fetch(`${GRAPH}/${igBusinessId}/media`, {
    method: "POST",
    body: params,
  });
  if (!createRes.ok) {
    throw new Error(
      `IG create container: ${createRes.status} ${await createRes.text()}`,
    );
  }
  const created = (await createRes.json()) as {
    id?: string;
    error?: { message?: string; code?: number };
  };
  if (!created.id) {
    throw new Error(
      `IG create container: no ID returned (${JSON.stringify(created.error ?? created)})`,
    );
  }
  console.log(`[ig-publish] container created: ${created.id}`);
  return created.id;
}

export async function igPublish(
  igBusinessId: string,
  pageAccessToken: string,
  input: IGPublishInput,
): Promise<{ platformPostId: string; permalink?: string }> {
  // ─── Carousel branch ────────────────────────────────────────
  if (input.imageUrls && input.imageUrls.length >= 2) {
    const carouselDeadline = Date.now() + 48_000;
    const childIds: string[] = [];
    for (const url of input.imageUrls.slice(0, 10)) {
      const isVid = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
      const childParams = new URLSearchParams({ access_token: pageAccessToken });
      childParams.set("is_carousel_item", "true");
      if (isVid) {
        childParams.set("media_type", "VIDEO");
        childParams.set("video_url", url);
      } else {
        childParams.set("image_url", safeIgImageUrl(url));
      }
      const r = await fetch(`${GRAPH}/${igBusinessId}/media`, {
        method: "POST",
        body: childParams,
      });
      if (!r.ok) {
        throw new Error(
          `IG carousel child create (${url}): ${r.status} ${await r.text()}`,
        );
      }
      const j = (await r.json()) as { id: string };
      // For video children, wait before assembling the parent.
      if (isVid) await sleep(10000);
      childIds.push(j.id);
    }

    // Parent carousel container
    const parentParams = new URLSearchParams({ access_token: pageAccessToken });
    if (input.caption) parentParams.set("caption", input.caption);
    parentParams.set("media_type", "CAROUSEL");
    parentParams.set("children", childIds.join(","));
    const parentRes = await fetch(`${GRAPH}/${igBusinessId}/media`, {
      method: "POST",
      body: parentParams,
    });
    if (!parentRes.ok) {
      throw new Error(
        `IG carousel parent create: ${parentRes.status} ${await parentRes.text()}`,
      );
    }
    const parentJson = (await parentRes.json()) as { id: string };

    // Publish with retry
    const pub = await publishWithRetry(
      igBusinessId,
      parentJson.id,
      pageAccessToken,
      false,
      carouselDeadline,
    );
    const linkRes = await fetch(graphGet(pub.id, "permalink", pageAccessToken));
    const link = linkRes.ok
      ? ((await linkRes.json()) as { permalink?: string })
      : null;
    return { platformPostId: pub.id, permalink: link?.permalink };
  }

  // ─── Single-item branch (with outer retry + deadline) ───────
  // Hard 48s budget so the entire flow fits inside Vercel's 60s
  // Hobby timeout (leaves ~12s for the server action overhead,
  // DB writes, and the permalink lookup at the end).
  //
  // Outer retry: if all publish attempts on one container fail,
  // create a BRAND NEW container and retry with the remaining time.
  // On the 2nd outer pass for images, skip the weserv proxy in case
  // the proxy is the reason IG couldn't fetch the media.
  const deadline = Date.now() + 48_000;
  const isVideo = !!input.videoUrl;
  // Videos need the full budget — skip outer retry for them.
  const maxOuterAttempts = isVideo ? 1 : 2;
  let lastError: Error | null = null;

  for (let outer = 1; outer <= maxOuterAttempts; outer++) {
    // Bail if we've used up the budget before even starting.
    if (Date.now() >= deadline) break;

    try {
      const skipProxy = outer > 1 && !isVideo;
      if (outer > 1) {
        console.log(
          `[ig-publish] outer retry ${outer}/${maxOuterAttempts}: ` +
          `recreating container${skipProxy ? " (raw URL, no proxy)" : ""}, ` +
          `${Math.round((deadline - Date.now()) / 1000)}s left`,
        );
      }

      const containerId = await createSingleContainer(
        igBusinessId,
        pageAccessToken,
        input,
        skipProxy,
      );

      const pub = await publishWithRetry(
        igBusinessId,
        containerId,
        pageAccessToken,
        isVideo,
        deadline,
      );

      // Success — lookup permalink
      const linkRes = await fetch(
        graphGet(pub.id, "permalink", pageAccessToken),
      );
      const link = linkRes.ok
        ? ((await linkRes.json()) as { permalink?: string })
        : null;

      return { platformPostId: pub.id, permalink: link?.permalink };
    } catch (e) {
      lastError = e as Error;
      console.warn(
        `[ig-publish] outer attempt ${outer} failed: ${lastError.message}`,
      );
    }
  }

  throw lastError ?? new Error("IG publish: unknown failure");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
