import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { consumeOauthState } from "@/lib/oauth-state";
import { linkedinExchangeCode, linkedinGetUserInfo } from "@/lib/platforms/linkedin";
import { env } from "@/lib/env";
import { sanitizeProviderError } from "@/lib/oauth-errors";

/**
 * LinkedIn OAuth callback.
 *
 * One SocialAccount row per LinkedIn member. Unlike Instagram/Facebook
 * (where one user can admin multiple Pages and we create one row per
 * Page), LinkedIn member auth gives us exactly one identity per OAuth
 * flow — the user themselves.
 *
 * Stored:
 *   platform        = LINKEDIN
 *   platformUserId  = the `sub` from /userinfo (= LinkedIn member id;
 *                     prepend "urn:li:person:" at post time)
 *   accessToken     = encrypted bearer token
 *   tokenExpiry     = computed from expires_in (LinkedIn tokens are
 *                     typically 60 days for the standard scope set)
 *   metadata        = { name, email, picture } for display
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const home = new URL("/dashboard", env("NEXT_PUBLIC_APP_URL") ?? url.origin);

  if (err) {
    home.searchParams.set("connect_error", sanitizeProviderError(err));
    return NextResponse.redirect(home);
  }
  if (!code || !state) {
    home.searchParams.set("connect_error", "missing_code");
    return NextResponse.redirect(home);
  }
  const session = await consumeOauthState(state);
  if (!session || session.platform !== "LINKEDIN") {
    home.searchParams.set("connect_error", "bad_state");
    return NextResponse.redirect(home);
  }

  const redirectUri = `${env("NEXT_PUBLIC_APP_URL")}/api/connect/linkedin/callback`;
  try {
    const tokens = await linkedinExchangeCode(code, redirectUri);
    const userInfo = await linkedinGetUserInfo(tokens.accessToken);

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId: session.userId,
          platform: Platform.LINKEDIN,
          platformUserId: userInfo.sub,
        },
      },
      create: {
        userId: session.userId,
        platform: Platform.LINKEDIN,
        platformUserId: userInfo.sub,
        username: userInfo.email ?? userInfo.name ?? null,
        displayName: userInfo.name ?? null,
        profileImage: userInfo.picture ?? null,
        accessToken: encrypt(tokens.accessToken),
        tokenExpiry: tokens.expiresAt,
        scopes: tokens.scope ?? null,
        metadata: {
          email: userInfo.email,
          givenName: userInfo.givenName,
          familyName: userInfo.familyName,
        },
        isActive: true,
      },
      update: {
        username: userInfo.email ?? userInfo.name ?? null,
        displayName: userInfo.name ?? null,
        profileImage: userInfo.picture ?? null,
        accessToken: encrypt(tokens.accessToken),
        tokenExpiry: tokens.expiresAt,
        scopes: tokens.scope ?? null,
        metadata: {
          email: userInfo.email,
          givenName: userInfo.givenName,
          familyName: userInfo.familyName,
        },
        isActive: true,
        lastError: null,
      },
    });

    home.searchParams.set("connected", "linkedin");
    return NextResponse.redirect(home);
  } catch (e) {
    console.error("[connect/linkedin] callback failed:", e);
    home.searchParams.set("connect_error", "connect_failed");
    return NextResponse.redirect(home);
  }
}
