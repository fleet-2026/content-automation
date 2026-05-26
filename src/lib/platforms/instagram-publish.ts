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
 * Try to publish a container. For video/Reels, the container needs
 * processing time. Instead of polling the (broken) GET status endpoint,
 * we retry the publish POST — Meta returns "The media was unable to be
 * published" or similar when not ready, and we retry after a delay.
 *
 * Returns the published media ID or throws after all retries fail.
 */
async function publishWithRetry(
  igBusinessId: string,
  containerId: string,
  accessToken: string,
  isVideo: boolean,
): Promise<{ id: string }> {
  // Keep total wait under ~50s so we don't exceed Vercel's 60s
  // Hobby timeout. 12 attempts × 4s delay = 48s worst case.
  // Pro plans get 300s, but we stay within Hobby limits.
  const maxAttempts = isVideo ? 12 : 3;
  const delayMs = isVideo ? 4000 : 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await sleep(delayMs);
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

    // If the error is "not ready yet" / "still processing", retry.
    // Meta uses various phrasings — match broadly.
    const isNotReady =
      body.includes("not ready") ||
      body.includes("not yet ready") ||
      body.includes("being processed") ||
      body.includes("media is not") ||
      body.includes("IN_PROGRESS") ||
      body.includes("PUBLISHED") || // container already published (race)
      pubRes.status === 400;

    if (isNotReady && attempt < maxAttempts) {
      console.log(
        `[ig-publish] attempt ${attempt}/${maxAttempts}: not ready yet (${pubRes.status}), retrying in ${delayMs / 1000}s`,
      );
      continue;
    }

    // Fatal error or last attempt — throw
    throw new Error(`IG publish: ${pubRes.status} ${body}`);
  }

  throw new Error(`IG publish: timed out after ${maxAttempts} attempts`);
}

export async function igPublish(
  igBusinessId: string,
  pageAccessToken: string,
  input: IGPublishInput,
): Promise<{ platformPostId: string; permalink?: string }> {
  // ─── Carousel branch ────────────────────────────────────────
  if (input.imageUrls && input.imageUrls.length >= 2) {
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
    );
    const linkRes = await fetch(graphGet(pub.id, "permalink", pageAccessToken));
    const link = linkRes.ok
      ? ((await linkRes.json()) as { permalink?: string })
      : null;
    return { platformPostId: pub.id, permalink: link?.permalink };
  }

  // ─── Single-item branch ────────────────────────────────────
  // 1. Create container
  const params = new URLSearchParams({ access_token: pageAccessToken });
  if (input.caption) params.set("caption", input.caption);

  if (input.videoUrl) {
    params.set("media_type", input.isReel ? "REELS" : "VIDEO");
    params.set("video_url", input.videoUrl);
    if (input.thumbnailUrl) params.set("thumb_offset", "0");
  } else if (input.imageUrl) {
    params.set("image_url", safeIgImageUrl(input.imageUrl));
  } else {
    throw new Error("igPublish requires imageUrl, videoUrl, or imageUrls[]");
  }

  console.log(
    `[ig-publish] creating container: igBusinessId=${igBusinessId} media_type=${params.get("media_type")}`,
  );
  const createRes = await fetch(`${GRAPH}/${igBusinessId}/media`, {
    method: "POST",
    body: params,
  });
  if (!createRes.ok) {
    throw new Error(`IG create container: ${createRes.status} ${await createRes.text()}`);
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
  const containerId = created.id;
  console.log(`[ig-publish] container created: ${containerId}`);

  // 2. Publish — retry loop handles video processing time.
  //    Skips the broken GET /{container}?fields=status_code endpoint.
  const isVideo = !!input.videoUrl;
  const pub = await publishWithRetry(
    igBusinessId,
    containerId,
    pageAccessToken,
    isVideo,
  );

  // 3. Lookup permalink
  const linkRes = await fetch(graphGet(pub.id, "permalink", pageAccessToken));
  const link = linkRes.ok
    ? ((await linkRes.json()) as { permalink?: string })
    : null;

  return { platformPostId: pub.id, permalink: link?.permalink };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
