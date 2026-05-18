import { env } from "@/lib/env";

/**
 * Facebook (Pages) OAuth + page listing.
 *
 * Reuses the same Meta App as Instagram (META_APP_ID / META_APP_SECRET).
 * Distinct from instagram.ts because:
 *  - Different scope set (Pages-specific permissions, not IG)
 *  - Different SocialAccount creation logic (one row per FB Page, no IG
 *    business account lookup)
 *  - Different publish target — /{page-id}/feed | /photos | /videos
 *
 * IMPORTANT: Meta deprecated personal Facebook profile posting via the
 * Graph API. The only supported target is a Facebook **Page** the user
 * admins. If a user has zero Pages, the connect flow errors with
 * `no_facebook_pages` so we don't store an empty SocialAccount.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

const FB_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "publish_video",
  "business_management",
];

export function facebookAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env("META_APP_ID") ?? "",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: FB_SCOPES.join(","),
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
}

/**
 * Reuses the same short→long token swap as Instagram. The resulting user
 * access token is what we use to list Pages — each Page then has its own
 * per-page access token returned by /me/accounts, and THAT is what we
 * persist on the SocialAccount row for posting.
 */
async function fetchWithTimeout(url: string, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`FB fetch: timeout after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function facebookExchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const params = new URLSearchParams({
    client_id: env("META_APP_ID") ?? "",
    client_secret: env("META_APP_SECRET") ?? "",
    redirect_uri: redirectUri,
    code,
  });
  const short = await fetchWithTimeout(`${GRAPH}/oauth/access_token?${params.toString()}`);
  if (!short.ok) throw new Error(`FB short token: ${short.status} ${await short.text()}`);
  const shortJson = (await short.json()) as Partial<{ access_token: string }>;
  if (typeof shortJson.access_token !== "string" || shortJson.access_token.length === 0) {
    throw new Error("FB short token: malformed response");
  }

  const longParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: env("META_APP_ID") ?? "",
    client_secret: env("META_APP_SECRET") ?? "",
    fb_exchange_token: shortJson.access_token,
  });
  const long = await fetchWithTimeout(`${GRAPH}/oauth/access_token?${longParams.toString()}`);
  if (!long.ok) throw new Error(`FB long token: ${long.status} ${await long.text()}`);
  const longJson = (await long.json()) as Partial<{ access_token: string; expires_in?: number }>;
  if (typeof longJson.access_token !== "string" || longJson.access_token.length === 0) {
    throw new Error("FB long token: malformed response");
  }
  const expiresAt = longJson.expires_in
    ? new Date(Date.now() + longJson.expires_in * 1000)
    : null;
  return { accessToken: longJson.access_token, expiresAt };
}

export async function facebookListPages(
  userAccessToken: string,
): Promise<Array<{ pageId: string; pageName: string; pageAccessToken: string }>> {
  const res = await fetchWithTimeout(
    `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`,
  );
  if (!res.ok) throw new Error(`me/accounts: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    data?: Array<{ id: string; name: string; access_token: string }>;
  };
  return (json.data ?? []).map((p) => ({
    pageId: p.id,
    pageName: p.name,
    pageAccessToken: p.access_token,
  }));
}
