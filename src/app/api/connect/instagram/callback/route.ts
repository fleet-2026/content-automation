import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { consumeOauthState } from "@/lib/oauth-state";
import {
  instagramExchangeCode,
  instagramListConnectedAccounts,
} from "@/lib/platforms/instagram";
import { env } from "@/lib/env";
import { sanitizeProviderError } from "@/lib/oauth-errors";

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
  if (!session || session.platform !== "INSTAGRAM") {
    home.searchParams.set("connect_error", "bad_state");
    return NextResponse.redirect(home);
  }

  const redirectUri = `${env("NEXT_PUBLIC_APP_URL")}/api/connect/instagram/callback`;
  try {
    const { accessToken: userAccessToken, expiresAt } = await instagramExchangeCode(code, redirectUri);
    const accounts = await instagramListConnectedAccounts(userAccessToken);
    if (!accounts.length) {
      home.searchParams.set(
        "connect_error",
        "no_ig_business_account_linked_to_facebook_page",
      );
      return NextResponse.redirect(home);
    }
    // Persist one SocialAccount per IG business account, using the page-scoped
    // token. Wrap in a transaction so a mid-loop failure (e.g. DB timeout)
    // can't leave the user with a partial set of connected pages.
    await prisma.$transaction(
      accounts.map((acct) =>
        prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: {
              userId: session.userId,
              platform: Platform.INSTAGRAM,
              platformUserId: acct.igBusinessId,
            },
          },
          create: {
            userId: session.userId,
            platform: Platform.INSTAGRAM,
            platformUserId: acct.igBusinessId,
            accessToken: encrypt(acct.pageAccessToken),
            tokenExpiry: expiresAt,
            metadata: { pageId: acct.pageId, pageName: acct.pageName },
            isActive: true,
          },
          update: {
            accessToken: encrypt(acct.pageAccessToken),
            tokenExpiry: expiresAt,
            metadata: { pageId: acct.pageId, pageName: acct.pageName },
            isActive: true,
            lastError: null,
          },
        }),
      ),
    );
    home.searchParams.set("connected", "instagram");
    return NextResponse.redirect(home);
  } catch (e) {
    console.error("[connect/instagram] callback failed:", e);
    home.searchParams.set("connect_error", "connect_failed");
    return NextResponse.redirect(home);
  }
}
