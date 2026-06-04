/**
 * Instagram publishing via Graph API.
 *
 * Two-step flow:
 *  1. POST /{ig-user-id}/media         → returns container id
 *  2. POST /{ig-user-id}/media_publish → publishes the container
 *
 * Container processing is polled via GET /{container-id}?fields=status_code
 * when the endpoint is available — this avoids wasting publish attempts.
 * Falls back to direct publish-and-retry when the status endpoint returns
 * a 400 (happens on some token configurations).
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
 * Poll the container's processing status. Returns:
 *  - "FINISHED" → ready to publish
 *  - "IN_PROGRESS" → still processing
 *  - "ERROR" → container failed (throw)
 *  - null → endpoint unavailable (fallback to blind publish)
 */
async function checkContainerStatus(
  containerId: string,
  accessToken: string,
): Promise<"FINISHED" | "IN_PROGRESS" | null> {
  try {
    const url = graphGet(containerId, "status_code", accessToken);
    const res = await fetch(url);
    if (!res.ok) return null; // endpoint unavailable for this token config
    const data = (await res.json()) as { status_code?: string };
    const status = data.status_code?.toUpperCase();
    if (status === "FINISHED") return "FINISHED";
    if (status === "ERROR") {
      throw new Error(`IG container ${containerId} status: ERROR`);
    }
    return "IN_PROGRESS";
  } catch (e) {
    if ((e as Error).message.includes("status: ERROR")) throw e;
    return null; // network / parse issue → fall back
  }
}

/**
 * Try to publish a container. Uses a hard deadline instead of fixed
 * attempt counts so the outer retry loop can share the same budget.
 *
 * Strategy:
 *  1. Poll container status if the endpoint works → wait for FINISHED
 *  2. Once FINISHED (or if polling unavailable) → attempt publish
 *  3. If publish says "not ready" → keep retrying until deadline
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
  const pollDelay = isVideo ? 5000 : 3000;
  const initialDelay = isVideo ? 6000 : 3000;

  // Wait before the first check so IG can fetch the media URL.
  await sleep(initialDelay);

  // ── Phase 1: poll container status (if the endpoint works) ────
  let statusAvailable = true;
  let statusChecks = 0;
  while (Date.now() < deadline) {
    const status = await checkContainerStatus(containerId, accessToken);
    statusChecks++;

    if (status === null) {
      // Endpoint unavailable — skip to Phase 2 (blind publish)
      statusAvailable = false;
      console.log(
        `[ig-publish] status endpoint unavailable, falling back to direct publish`,
      );
      break;
    }
    if (status === "FINISHED") {
      console.log(
        `[ig-publish] container FINISHED after ${statusChecks} status checks`,
      );
      break;
    }
    // Still IN_PROGRESS
    console.log(
      `[ig-publish] status: IN_PROGRESS (check ${statusChecks}), ` +
      `${Math.round((deadline - Date.now()) / 1000)}s left`,
    );
    await sleep(pollDelay);
  }

  // ── Phase 2: attempt publish ──────────────────────────────────
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    if (attempt > 1) {
      await sleep(pollDelay);
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

    // Only retry on SPECIFIC "media still processing" strings.
    // Do NOT retry on blanket 400 — that catches token / permission
    // errors and wastes the entire deadline.
    const isStillProcessing =
      bodyLower.includes("not ready") ||
      bodyLower.includes("not yet ready") ||
      bodyLower.includes("being processed") ||
      bodyLower.includes("media is not ready") ||
      bodyLower.includes("in_progress");

    if (isStillProcessing) {
      console.log(
        `[ig-publish] publish attempt ${attempt}: still processing (${pubRes.status}), ` +
        `${Math.round((deadline - Date.now()) / 1000)}s left`,
      );
      continue;
    }

    // Any other error is fatal — fail fast so the outer retry can
    // try a fresh container with the remaining budget.
    throw new Error(`IG publish: ${pubRes.status} ${body}`);
  }

  throw new Error(
    `IG publish: deadline reached after ${statusChecks} status checks + ${attempt} publish attempts`,
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
    const carouselDeadline = Date.now() + 53_000;
    const childIds: string[] = [];
    // Instagram raised the carousel cap from 10 to 20 (2025). We cap at 15
    // to match the composer/carousel UI limit.
    for (const url of input.imageUrls.slice(0, 15)) {
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
  // Hard 53s budget — fits inside Vercel's 60s Hobby timeout with
  // ~7s left for the server action overhead (DB writes, permalink
  // lookup). Container status polling avoids wasting time on blind
  // publish attempts, so the budget stretches further.
  //
  // Outer retry: if publish fails, create a BRAND NEW container and
  // retry with the remaining time. On the 2nd pass for images, skip
  // the weserv proxy in case it's the reason IG couldn't fetch media.
  const deadline = Date.now() + 53_000;
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
