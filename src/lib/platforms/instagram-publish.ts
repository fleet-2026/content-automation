/**
 * Instagram publishing via Graph API.
 *
 * Two-step flow:
 *  1. POST /{ig-user-id}/media         → returns container id
 *  2. POST /{ig-user-id}/media_publish → publishes the container
 *
 * For Reels/Video: poll the container's status until "FINISHED" before publish.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

/** Build a Graph API GET URL with properly-encoded access_token.
 *  Raw string interpolation breaks when tokens contain +, =, etc. */
function graphGet(path: string, fields: string, token: string): string {
  const p = new URLSearchParams({ fields, access_token: token });
  return `${GRAPH}/${path}?${p.toString()}`;
}

/** Wrap a public image URL through the weserv.nl smart-crop proxy so
 *  Instagram receives a 4:5 (1080×1350) feed-safe portrait. Without this,
 *  9:16 source images (which is what AI image generators and phone-cam
 *  Reels output) get center-cropped by Instagram itself — chopping the
 *  top of the face when the subject sits high in the frame.
 *
 *  weserv `a=attention` does content/face-aware focal-point selection
 *  before crop, so the subject stays in frame.
 *
 *  Video URLs pass through unchanged (weserv doesn't transcode video). */
function safeIgImageUrl(rawUrl: string): string {
  // Skip videos
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(rawUrl)) return rawUrl;
  // Skip if already a weserv URL (avoid double-wrapping)
  if (rawUrl.startsWith("https://images.weserv.nl/")) return rawUrl;
  // Strip the https:// prefix — weserv wants bare host+path in `?url=`.
  const upstream = rawUrl.replace(/^https?:\/\//i, "");
  return (
    "https://images.weserv.nl/?url=" +
    encodeURIComponent(upstream) +
    // 1080×1350 = Instagram's max-quality 4:5 feed dimension. fit=cover
    // forces both dimensions to be filled.
    //
    // a=top anchors the crop to the TOP of the image instead of using
    // entropy-based focal detection. For portrait / talking-head /
    // editorial content the face is reliably in the upper half — top
    // anchor means we cut from the BOTTOM (feet/background) and the
    // head stays in frame every time.
    //
    // Previously used a=attention (entropy-based) which could pick a
    // "busy" non-face area as the focal point and crop the head off,
    // which is exactly what happened on the second image of the last
    // carousel post.
    "&w=1080&h=1350&fit=cover&a=top&output=jpg&q=90"
  );
}

export type IGPublishInput = {
  caption?: string;
  imageUrl?: string;     // for IMAGE
  videoUrl?: string;     // for REEL / VIDEO — must be public URL (R2)
  thumbnailUrl?: string; // optional cover for video
  isReel?: boolean;
  // NEW: when present (≥2 URLs), publishes a CAROUSEL — IG up to 10 items.
  // Takes precedence over imageUrl/videoUrl. Mix of images + videos OK.
  imageUrls?: string[];
};

export async function igPublish(
  igBusinessId: string,
  pageAccessToken: string,
  input: IGPublishInput,
): Promise<{ platformPostId: string; permalink?: string }> {
  // ─── Carousel branch ────────────────────────────────────────
  // 3-step flow per IG Graph API docs:
  //   a. For EACH child, create a media container with
  //      is_carousel_item=true → returns child container id
  //   b. Create the parent carousel container with media_type=CAROUSEL
  //      and children=<comma-separated ids>
  //   c. POST media_publish with the parent creation_id
  // We poll any video children until READY before assembling the parent.
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
        // Route the image URL through weserv smart-crop so IG receives a
        // 4:5 feed-ready portrait with the face / subject centered, not
        // top-cropped (which is what was happening on the previous post).
        childParams.set("image_url", safeIgImageUrl(url));
      }
      const r = await fetch(`${GRAPH}/${igBusinessId}/media`, {
        method: "POST",
        body: childParams,
      });
      if (!r.ok)
        throw new Error(
          `IG carousel child create (${url}): ${r.status} ${await r.text()}`,
        );
      const j = (await r.json()) as { id: string };
      // Poll video children until processed
      if (isVid) {
        for (let i = 0; i < 30; i++) {
          await sleep(3000);
          const st = await fetch(graphGet(j.id, "status_code", pageAccessToken));
          if (!st.ok) break;
          const s = (await st.json()) as { status_code?: string };
          if (s.status_code === "FINISHED") break;
          if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
            throw new Error(`IG carousel child status: ${s.status_code}`);
          }
        }
      }
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
    if (!parentRes.ok)
      throw new Error(
        `IG carousel parent create: ${parentRes.status} ${await parentRes.text()}`,
      );
    const parentJson = (await parentRes.json()) as { id: string };

    // Publish parent
    const pubRes = await fetch(`${GRAPH}/${igBusinessId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({
        creation_id: parentJson.id,
        access_token: pageAccessToken,
      }),
    });
    if (!pubRes.ok)
      throw new Error(`IG carousel publish: ${pubRes.status} ${await pubRes.text()}`);
    const pub = (await pubRes.json()) as { id: string };
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
    // Same smart-crop wrap as the carousel path — face stays centered
    // when IG resizes for the feed.
    params.set("image_url", safeIgImageUrl(input.imageUrl));
  } else {
    throw new Error("igPublish requires imageUrl, videoUrl, or imageUrls[]");
  }

  console.log(
    `[ig-publish] creating container: igBusinessId=${igBusinessId} media_type=${params.get("media_type")} video_url=${input.videoUrl?.slice(0, 80)}`,
  );
  const createRes = await fetch(`${GRAPH}/${igBusinessId}/media`, {
    method: "POST",
    body: params,
  });
  if (!createRes.ok) throw new Error(`IG create container: ${createRes.status} ${await createRes.text()}`);
  const created = (await createRes.json()) as { id?: string; error?: { message?: string; code?: number } };
  if (!created.id) {
    throw new Error(
      `IG create container: no ID returned (${JSON.stringify(created.error ?? created)})`,
    );
  }
  const containerId = created.id;
  console.log(`[ig-publish] container created: ${containerId}`);

  // 2. Poll until ready (video/reel only)
  if (input.videoUrl) {
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const stRes = await fetch(
        graphGet(containerId, "status_code,status", pageAccessToken),
      );
      if (!stRes.ok) {
        const body = await stRes.text();
        throw new Error(`IG poll container ${containerId}: ${stRes.status} ${body}`);
      }
      const st = (await stRes.json()) as { status_code?: string; status?: string };
      console.log(`[ig-publish] poll ${i + 1}/30: status_code=${st.status_code}`);
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
        throw new Error(
          `IG container failed: ${st.status_code} ${st.status ?? ""} (container=${containerId}, videoUrl=${input.videoUrl?.slice(0, 80)})`,
        );
      }
    }
  }

  // 3. Publish
  const pubRes = await fetch(`${GRAPH}/${igBusinessId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: containerId, access_token: pageAccessToken }),
  });
  if (!pubRes.ok) throw new Error(`IG publish: ${pubRes.status} ${await pubRes.text()}`);
  const pub = (await pubRes.json()) as { id: string };

  // 4. Lookup permalink
  const linkRes = await fetch(graphGet(pub.id, "permalink", pageAccessToken));
  const link = linkRes.ok ? ((await linkRes.json()) as { permalink?: string }) : null;

  return { platformPostId: pub.id, permalink: link?.permalink };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
