import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { instagramAuthUrl } from "@/lib/platforms/instagram";
import { setOauthState } from "@/lib/oauth-state";
import { ensureDefaultUserId } from "@/lib/default-user";
import { env } from "@/lib/env";

export async function GET() {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? (await ensureDefaultUserId());
  if (!userId)
    return NextResponse.redirect(
      new URL("/login", env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000"),
    );

  const redirectUri = `${env("NEXT_PUBLIC_APP_URL")}/api/connect/instagram/callback`;
  const state = await setOauthState({ userId, platform: "INSTAGRAM" });
  return NextResponse.redirect(instagramAuthUrl(redirectUri, state));
}
