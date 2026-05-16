/**
 * TikTok publishing via Content Posting API.
 *
 * Two modes:
 *  - DIRECT_POST: requires TikTok-approved scope; auto-publishes
 *  - INBOX (default): video lands in the user's TikTok app inbox; they finalize there.
 *
 * Inbox mode works without special review and is the safest default.
 */

const API = "https://open.tiktokapis.com/v2";

export type TTPublishInput = {
  videoUrl?: string;
  videoBuffer?: Buffer;
  title?: string;
};

export async function ttPublishToInbox(
  accessToken: string,
  input: TTPublishInput,
): Promise<{ publishId: string }> {
  // 1. Init the upload
  const initRes = await fetch(`${API}/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_info: input.videoUrl
        ? { source: "PULL_FROM_URL", video_url: input.videoUrl }
        : { source: "FILE_UPLOAD", video_size: input.videoBuffer?.length ?? 0, chunk_size: input.videoBuffer?.length ?? 0, total_chunk_count: 1 },
    }),
  });
  if (!initRes.ok) throw new Error(`TT init: ${initRes.status} ${await initRes.text()}`);
  const init = (await initRes.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { code?: string; message?: string };
  };

  const publishId = init.data?.publish_id;
  if (!publishId) throw new Error(`TT init: no publish_id (${JSON.stringify(init.error)})`);

  // 2. If FILE_UPLOAD, PUT the bytes to upload_url
  if (input.videoBuffer && init.data?.upload_url) {
    const bytes = new Uint8Array(input.videoBuffer);
    const uploadRes = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.length),
        "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
      },
      body: bytes,
    });
    if (!uploadRes.ok) throw new Error(`TT upload: ${uploadRes.status}`);
  }

  return { publishId };
}

export async function ttPublishStatus(accessToken: string, publishId: string) {
  const res = await fetch(`${API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });
  if (!res.ok) throw new Error(`TT status: ${res.status} ${await res.text()}`);
  return res.json();
}
