import { NextResponse, type NextRequest } from "next/server";
import { safeFetch, SafeFetchError } from "@/lib/safe-fetch";
import { tryGetUser } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";

/**
 * CORS-friendly image proxy.
 *
 * The hook-on-image canvas editor needs to draw remote images (R2, OpenAI
 * images service, etc.) onto a `<canvas>` and then export the result. That
 * only works if either:
 *   (a) the image's origin returns Access-Control-Allow-Origin headers, OR
 *   (b) we re-serve the image from the same origin as the page.
 *
 * This route is (b). It fetches the upstream image through SafeFetch (SSRF
 * guard, redirect re-validation, size cap) and streams it back with proper
 * CORS headers so the canvas can pull it as same-origin.
 *
 * Auth: required — anonymous proxying turns this into a free open relay.
 * Rate limit: 60/min per user. Image fetches are cheap but bandwidth isn't
 * free, and we don't want this becoming an exfiltration tool.
 * Cap: 15 MB per image. Large enough for a 4K JPEG, small enough that an
 * attacker can't drain the function's memory budget.
 */

const MAX_BYTES = 15 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const userId = await tryGetUser();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const rl = await rateLimit(`proxy-image:${userId}`, { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await safeFetch(url, {
      maxBytes: MAX_BYTES,
      timeoutMs: 20_000,
    });

    // Reject non-image content types — this is an *image* proxy. Without
    // this check an attacker could use it to fetch arbitrary text/HTML
    // through our origin, defeating the same-origin guarantee.
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "not_an_image" }, { status: 415 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof SafeFetchError) {
      console.error("[proxy-image]", e.code, e.message);
      // Never echo the upstream URL or raw error — that's the SSRF leak
      // surface SafeFetch is built to close.
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    console.error("[proxy-image] unexpected:", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
