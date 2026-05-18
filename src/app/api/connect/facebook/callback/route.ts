import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { consumeOauthState } from "@/lib/oauth-state";
import { facebookExchangeCode, facebookListPages } from "@/lib/platforms/facebook";
import { env } from "@/lib/env";
import { sanitizeProviderError } from "@/lib/oauth-errors";

/**
 * Facebook OAuth callback.
 *
 * Mirrors the Instagram callback's shape — short→long token swap, then
 * /me/accounts to list every Page the user admins. Each Page gets its
 * own SocialAccount row keyed by (userId, platform=FACEBOOK, platformUserId=pageId)
 * with the per-Page access token encrypted at rest.
 *
 * If the user has zero admin'd Pages, we surface `no_facebook_pages` to
 * the dashboard rather than persisting an empty stub.
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
  if (!session || session.platform !== "FACEBOOK") {
    home.searchParams.set("connect_error", "bad_state");
    return NextResponse.redirect(home);
  }

  const redirectUri = `${env("NEXT_PUBLIC_APP_URL")}/api/connect/facebook/callback`;
  try {
    const { accessToken: userAccessToken, expiresAt } = await facebookExchangeCode(code, redirectUri);
    const pages = await facebookListPages(userAccessToken);
    if (!pages.length) {
      home.searchParams.set("connect_error", "no_facebook_pages");
      return NextResponse.redirect(home);
    }

    // Atomic write — if any page fails to persist, none do. Avoids the
    // partial-state issue that bit the Instagram path before we added
    // $transaction.
    await prisma.$transaction(
      pages.map((page) =>
        prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: {
              userId: session.userId,
              platform: Platform.FACEBOOK,
              platformUserId: page.pageId,
            },
          },
          create: {
            userId: session.userId,
            platform: Platform.FACEBOOK,
            platformUserId: page.pageId,
            displayName: page.pageName,
            username: page.pageName,
            accessToken: encrypt(page.pageAccessToken),
            tokenExpiry: expiresAt,
            metadata: { pageName: page.pageName },
            isActive: true,
          },
          update: {
            displayName: page.pageName,
            username: page.pageName,
            accessToken: encrypt(page.pageAccessToken),
            tokenExpiry: expiresAt,
            metadata: { pageName: page.pageName },
            isActive: true,
            lastError: null,
          },
        }),
      ),
    );

    home.searchParams.set("connected", "facebook");
    return NextResponse.redirect(home);
  } catch (e) {
    console.error("[connect/facebook] callback failed:", e);
    home.searchParams.set("connect_error", "connect_failed");
    return NextResponse.redirect(home);
  }
}
