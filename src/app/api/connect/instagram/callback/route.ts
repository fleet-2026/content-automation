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

    // ── Diagnostic: log raw /me/accounts so we can see WHY IG fails ──
    // This is the critical call — if a Page has instagram_business_account
    // the connection works. If not, we need to know what Meta returned.
    const diagRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${userAccessToken}`,
    );
    const diagJson = diagRes.ok ? await diagRes.json() : null;
    console.log(
      "[connect/instagram] /me/accounts raw response:",
      JSON.stringify(diagJson, null, 2),
    );

    // Also check what scopes the token actually has
    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${userAccessToken}&access_token=${userAccessToken}`,
    );
    const debugJson = debugRes.ok ? await debugRes.json() : null;
    console.log(
      "[connect/instagram] token debug_info:",
      JSON.stringify(debugJson?.data?.scopes ?? debugJson, null, 2),
    );

    const accounts = await instagramListConnectedAccounts(userAccessToken);
    if (!accounts.length) {
      // Build a more specific error message
      const pages = (diagJson as { data?: Array<{ id: string; name: string; instagram_business_account?: unknown }> })?.data ?? [];
      const pagesCount = pages.length;
      const pagesWithIg = pages.filter((p) => !!p.instagram_business_account).length;
      const scopes = (debugJson as { data?: { scopes?: string[] } })?.data?.scopes ?? [];

      const detail = pagesCount === 0
        ? "no_pages_returned"
        : pagesWithIg === 0
        ? `${pagesCount}_pages_but_none_have_ig_linked`
        : "unknown";

      console.error(
        `[connect/instagram] FAILED: ${detail}`,
        { pagesCount, pagesWithIg, scopes, pageNames: pages.map((p) => p.name) },
      );

      home.searchParams.set(
        "connect_error",
        `ig_${detail}__scopes_${scopes.join("+")}__pages_${pagesCount}`,
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
