import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { facebookAuthUrl } from "@/lib/platforms/facebook";
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

  const redirectUri = `${env("NEXT_PUBLIC_APP_URL")}/api/connect/facebook/callback`;
  const state = await setOauthState({ userId, platform: "FACEBOOK" });
  return NextResponse.redirect(facebookAuthUrl(redirectUri, state));
}
