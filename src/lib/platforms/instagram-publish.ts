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
};

export async function igPublish(
  igBusinessId: string,
  pageAccessToken: string,
  input: IGPublishInput,
): Promise<{ platformPostId: string; permalink?: string }> {
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
    throw new Error("igPublish requires imageUrl or videoUrl");
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
