import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { consumeOauthState } from "@/lib/oauth-state";
import { YouTubeClient, youtubeExchangeCode } from "@/lib/platforms/youtube";
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
  if (!session || session.platform !== "YOUTUBE") {
    home.searchParams.set("connect_error", "bad_state");
    return NextResponse.redirect(home);
  }

  const redirectUri = `${env("NEXT_PUBLIC_APP_URL")}/api/connect/youtube/callback`;
  try {
    const tokens = await youtubeExchangeCode(code, redirectUri);
    if (!tokens.access_token) throw new Error("No access_token from Google");

    const client = new YouTubeClient({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });
    const profile = await client.getProfile();

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId: session.userId,
          platform: Platform.YOUTUBE,
          platformUserId: profile.platformUserId,
        },
      },
      create: {
        userId: session.userId,
        platform: Platform.YOUTUBE,
        platformUserId: profile.platformUserId,
        username: profile.username,
        displayName: profile.displayName,
        profileImage: profile.profileImage,
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: tokens.scope ?? null,
        metadata: profile.metadata as object,
        isActive: true,
      },
      update: {
        username: profile.username,
        displayName: profile.displayName,
        profileImage: profile.profileImage,
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: tokens.scope ?? null,
        metadata: profile.metadata as object,
        isActive: true,
        lastError: null,
      },
    });

    home.searchParams.set("connected", "youtube");
    return NextResponse.redirect(home);
  } catch (e) {
    // Log raw cause for Vercel logs / debugging — never leak it to the URL.
    console.error("[connect/youtube] callback failed:", e);
    home.searchParams.set("connect_error", "connect_failed");
    return NextResponse.redirect(home);
  }
}
