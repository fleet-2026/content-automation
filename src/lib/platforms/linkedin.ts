import { env } from "@/lib/env";

/**
 * LinkedIn OAuth 2.0 + user info.
 *
 * Uses LinkedIn's OpenID Connect endpoint (the modern flow LinkedIn
 * recommends as of 2024). Requires the app to have both products added:
 *   - "Sign In with LinkedIn using OpenID Connect" (provides openid /
 *     profile / email scopes — auto-approved)
 *   - "Share on LinkedIn" (provides w_member_social — auto-approved
 *     for individual member posting)
 *
 * Env vars required:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *
 * Both come from https://www.linkedin.com/developers/apps after creating
 * the app. They go into Vercel as encrypted production env vars.
 */

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

const LI_SCOPES = [
  "openid",
  "profile",
  "email",
  "w_member_social", // required to publish on behalf of the member
];

export function linkedinAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env("LINKEDIN_CLIENT_ID") ?? "",
    redirect_uri: redirectUri,
    state,
    scope: LI_SCOPES.join(" "), // LinkedIn uses SPACE-separated scopes (Meta uses commas, TikTok uses commas — every provider is different)
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function linkedinExchangeCode(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  expiresAt: Date;
  // OpenID Connect returns an id_token alongside the access token. We
  // don't currently parse it (we use /userinfo instead for the member
  // URN) but expose it so future callers can decode without re-querying.
  idToken?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: env("LINKEDIN_CLIENT_ID") ?? "",
    client_secret: env("LINKEDIN_CLIENT_SECRET") ?? "",
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("LinkedIn exchange: timeout after 15s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`LinkedIn exchange: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as Partial<{
    access_token: string;
    expires_in: number;
    id_token: string;
    scope: string;
  }>;
  if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
    throw new Error("LinkedIn exchange: malformed token response");
  }
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    idToken: json.id_token,
    scope: json.scope,
  };
}

/**
 * The `sub` field in /v2/userinfo is the member's Person URN suffix —
 * we need to prefix it with `urn:li:person:` for use as a post `author`.
 * That's done at the call site (in linkedin-publish.ts), not here.
 */
export type LinkedInUserInfo = {
  sub: string; // person URN suffix
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  email?: string;
};

export async function linkedinGetUserInfo(
  accessToken: string,
): Promise<LinkedInUserInfo> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("LinkedIn userinfo: timeout after 15s");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`LinkedIn userinfo: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as Partial<{
    sub: string;
    name: string;
    given_name: string;
    family_name: string;
    picture: string;
    email: string;
  }>;
  if (typeof json.sub !== "string") {
    throw new Error("LinkedIn userinfo: missing sub (member URN)");
  }
  return {
    sub: json.sub,
    name: json.name,
    givenName: json.given_name,
    familyName: json.family_name,
    picture: json.picture,
    email: json.email,
  };
}
