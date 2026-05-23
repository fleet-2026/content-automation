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
        childParams.set("image_url", url);
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
          const st = await fetch(
            `${GRAPH}/${j.id}?fields=status_code&access_token=${pageAccessToken}`,
          );
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
    const linkRes = await fetch(
      `${GRAPH}/${pub.id}?fields=permalink&access_token=${pageAccessToken}`,
    );
    const link = linkRes.ok
      ? ((await linkRes.json()) as { permalink?: string })
      : null;
    return { platformPostId: pub.id, permalink: link?.permalink };
  }

  // ─── Single-item branch (unchanged) ─────────────────────────
  // 1. Create container
  const params = new URLSearchParams({ access_token: pageAccessToken });
  if (input.caption) params.set("caption", input.caption);

  if (input.videoUrl) {
    params.set("media_type", input.isReel ? "REELS" : "VIDEO");
    params.set("video_url", input.videoUrl);
    if (input.thumbnailUrl) params.set("thumb_offset", "0");
  } else if (input.imageUrl) {
    params.set("image_url", input.imageUrl);
  } else {
    throw new Error("igPublish requires imageUrl, videoUrl, or imageUrls[]");
  }

  const createRes = await fetch(`${GRAPH}/${igBusinessId}/media`, {
    method: "POST",
    body: params,
  });
  if (!createRes.ok) throw new Error(`IG create container: ${createRes.status} ${await createRes.text()}`);
  const created = (await createRes.json()) as { id: string };
  const containerId = created.id;

  // 2. Poll until ready (video/reel only)
  if (input.videoUrl) {
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const stRes = await fetch(
        `${GRAPH}/${containerId}?fields=status_code,status&access_token=${pageAccessToken}`,
      );
      if (!stRes.ok) throw new Error(`IG status: ${stRes.status} ${await stRes.text()}`);
      const st = (await stRes.json()) as { status_code?: string; status?: string };
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
        throw new Error(`IG container failed: ${st.status_code} ${st.status ?? ""}`);
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
  const linkRes = await fetch(
    `${GRAPH}/${pub.id}?fields=permalink&access_token=${pageAccessToken}`,
  );
  const link = linkRes.ok ? ((await linkRes.json()) as { permalink?: string }) : null;

  return { platformPostId: pub.id, permalink: link?.permalink };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
