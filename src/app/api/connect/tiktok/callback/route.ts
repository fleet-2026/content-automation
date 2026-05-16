import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { consumeOauthState } from "@/lib/oauth-state";
import { TikTokClient, tiktokExchangeCode } from "@/lib/platforms/tiktok";
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
  if (!session || session.platform !== "TIKTOK") {
    home.searchParams.set("connect_error", "bad_state");
    return NextResponse.redirect(home);
  }

  const redirectUri =
    env("TIKTOK_REDIRECT_URI") ??
    `${env("NEXT_PUBLIC_APP_URL")}/api/connect/tiktok/callback`;
  try {
    const tokens = await tiktokExchangeCode(code, redirectUri);
    const client = new TikTokClient({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
    const profile = await client.getProfile();

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId: session.userId,
          platform: Platform.TIKTOK,
          platformUserId: tokens.openId,
        },
      },
      create: {
        userId: session.userId,
        platform: Platform.TIKTOK,
        platformUserId: tokens.openId,
        username: profile.username,
        displayName: profile.displayName,
        profileImage: profile.profileImage,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        tokenExpiry: tokens.expiresAt,
        scopes: tokens.scope,
        metadata: { ...(profile.metadata ?? {}), refreshExpiresAt: tokens.refreshExpiresAt },
        isActive: true,
      },
      update: {
        username: profile.username,
        displayName: profile.displayName,
        profileImage: profile.profileImage,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        tokenExpiry: tokens.expiresAt,
        scopes: tokens.scope,
        metadata: { ...(profile.metadata ?? {}), refreshExpiresAt: tokens.refreshExpiresAt },
        isActive: true,
        lastError: null,
      },
    });

    home.searchParams.set("connected", "tiktok");
    return NextResponse.redirect(home);
  } catch (e) {
    console.error("[connect/tiktok] callback failed:", e);
    home.searchParams.set("connect_error", "connect_failed");
    return NextResponse.redirect(home);
  }
}
