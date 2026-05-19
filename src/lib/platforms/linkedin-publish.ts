/**
 * LinkedIn member-share publishing.
 *
 * Uses the v2 ugcPosts endpoint (the stable one, despite LinkedIn pushing
 * /rest/posts as the "newer" API). For text-only posts the v2 endpoint
 * is simpler and doesn't require the Versioning header.
 *
 * Currently supports TEXT-ONLY posts. Image and video posts require a
 * two-step flow (register upload → PUT to returned URL → reference asset
 * URN in the ugcPost body). That's tracked as a TODO — the call site in
 * publish.ts catches the "li_media_not_implemented" error and the
 * publishResults JSON surfaces it to the UI.
 *
 * The `memberUrn` argument is built from /v2/userinfo's `sub` field
 * (which is the bare member id like "abc123XYZ") plus the `urn:li:person:`
 * prefix that LinkedIn requires for post authors.
 */

const POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

export type LIPublishResult = {
  platformPostId: string; // urn:li:share:... — also the entity id
  permalink?: string;
};

export async function liPublishText(
  memberSub: string, // bare sub from /userinfo (we prepend the URN prefix)
  accessToken: string,
  input: {
    message: string;
  },
): Promise<LIPublishResult> {
  if (!memberSub) throw new Error("liPublishText: missing memberSub (URN suffix)");
  if (!accessToken) throw new Error("liPublishText: missing accessToken");
  if (!input.message?.trim()) {
    throw new Error("liPublishText: message is required (LinkedIn doesn't allow empty posts)");
  }

  const authorUrn = `urn:li:person:${memberSub}`;
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: input.message },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // LinkedIn requires this restli-protocol header on /v2/ugcPosts.
        // Omitting it returns a confusing 400 about missing fields.
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("LinkedIn publish: timeout after 30s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`LinkedIn publish: ${res.status} ${await res.text()}`);
  }
  // Successful ugcPosts returns the new post id in the `x-restli-id`
  // header, NOT in the body (the body is empty 201). The id format is
  // `urn:li:share:1234567890123456789`.
  const postId = res.headers.get("x-restli-id") ?? "";
  if (!postId) {
    throw new Error("LinkedIn publish: no x-restli-id in response");
  }
  return {
    platformPostId: postId,
    // Synthesizing a permalink from the URN works for member shares but
    // is brittle (LinkedIn rewrites URLs occasionally). Skip rather than
    // return a possibly-broken link.
    permalink: undefined,
  };
}
