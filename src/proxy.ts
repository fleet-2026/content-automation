import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Auth proxy (formerly middleware — renamed in Next 16).
 *
 * Three modes, checked in order:
 *
 *  1. SHARED PASSWORD (if SHARED_PASSWORD env var is set, in production)
 *     — One shared password gates every page + API route. A signed cookie
 *       is set on successful entry so the user only types it once.
 *     — Free alternative to Vercel's paid Password Protection feature.
 *     — Useful when AUTH_DEV_OPEN=1 (no real auth) but you still want
 *       a soft gate so the public URL isn't accessible to anyone.
 *
 *  2. DEV-OPEN (AUTH_DEV_OPEN=1 in prod, or NODE_ENV !== "production")
 *     — Pass-through, server actions fall back to ensureDefaultUserId().
 *
 *  3. STRICT AUTH (everything else)
 *     — Require a real NextAuth session for protected paths.
 *
 * Public paths: /login, /api/auth/*, /api/inngest, OAuth callbacks, /_next, favicon.
 */

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/inngest",
  "/api/connect", // OAuth flows (start + callback). State is HMAC-signed.
  "/_next",
  "/favicon.ico",
  // Public content site — /guides is the SEO-facing daily AI guides
  // microsite. Anonymous visitors must be able to read /guides + every
  // /guides/<slug> without hitting the auth wall. The admin manages
  // these via /daily-post (still auth-gated).
  "/guides",
  // Sitemap + robots so crawlers can discover the public guides.
  "/sitemap.xml",
  "/robots.txt",
  // Legal pages — must be reachable by TikTok / Meta audit crawlers
  // (they 404-check Privacy + Terms URLs before approving scopes).
  "/privacy",
  "/terms",
];

// The shared-password gate page lives at /access (we serve it directly from
// the proxy to keep it impossible to bypass). Must also be public.
const ACCESS_PATH = "/access";

const GATE_COOKIE = "shared_access";
const GATE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isDevOpen(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.AUTH_DEV_OPEN === "1";
  }
  return process.env.AUTH_DEV_OPEN !== "0";
}

function isSharedPasswordMode(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    !!process.env.SHARED_PASSWORD &&
    process.env.SHARED_PASSWORD.length > 0
  );
}

/**
 * Derive a per-deploy cookie token from the shared password. Using the
 * password itself directly would let anyone with read access to the cookie
 * jar steal the secret; hashing makes it one-way.
 *
 * We use a simple keyed digest based on SHARED_PASSWORD + AUTH_SECRET so
 * rotating either invalidates all existing sessions.
 */
async function expectedCookieValue(): Promise<string> {
  const secret = `${process.env.SHARED_PASSWORD ?? ""}|${process.env.AUTH_SECRET ?? ""}`;
  const data = new TextEncoder().encode(secret);
  // Web Crypto is available in the Edge runtime where middleware runs.
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string equality. Both inputs hashed to a fixed-length digest
 * before compare so length itself doesn't leak via timingSafeEqual's length
 * pre-check.
 */
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Extract the request IP from common Vercel/CDN headers, falling back to a
 * stable bucket ("anon") so rate-limit keys still cluster sensibly.
 */
function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anon"
  );
}

/**
 * Handle POST submissions to /access (the password form) directly from the
 * proxy so we don't need a route handler for it.
 *
 * Hardened against brute force + timing attacks:
 *  - 10 attempts/min per IP (RATE_LIMITS.ACCESS_ATTEMPT)
 *  - Constant-time password compare via SHA-256 digests
 */
async function handleAccessSubmit(req: NextRequest): Promise<NextResponse> {
  // Per-IP throttle: 10 attempts / minute. Beyond that, force a 60s cooldown
  // before the next try.
  const rl = await rateLimit(`access:${getIp(req)}`, RATE_LIMITS.ACCESS_ATTEMPT);
  if (!rl.allowed) {
    const errUrl = req.nextUrl.clone();
    errUrl.pathname = ACCESS_PATH;
    errUrl.searchParams.set("error", "rate_limited");
    const from = req.nextUrl.searchParams.get("from");
    if (from) errUrl.searchParams.set("from", from);
    return NextResponse.redirect(errUrl);
  }

  const form = await req.formData().catch(() => null);
  const submitted = (form?.get("password") ?? "").toString();
  const expected = process.env.SHARED_PASSWORD ?? "";

  const ok =
    expected.length > 0 && (await timingSafeStringEqual(submitted, expected));

  if (ok) {
    const next = req.nextUrl.searchParams.get("from") || "/dashboard";
    const dest = req.nextUrl.clone();
    dest.pathname = next.startsWith("/") ? next : "/dashboard";
    dest.search = "";
    const res = NextResponse.redirect(dest);
    res.cookies.set(GATE_COOKIE, await expectedCookieValue(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: GATE_COOKIE_MAX_AGE,
    });
    return res;
  }

  // Wrong password — redirect back to the access page with an error flag.
  const errUrl = req.nextUrl.clone();
  errUrl.pathname = ACCESS_PATH;
  errUrl.searchParams.set("error", "1");
  // Preserve where they were trying to go
  const from = req.nextUrl.searchParams.get("from");
  if (from) errUrl.searchParams.set("from", from);
  return NextResponse.redirect(errUrl);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ─── Shared-password mode ────────────────────────────────────
  if (isSharedPasswordMode()) {
    // POST to /access is the form submission — handle it here so the gate
    // doesn't redirect into itself.
    if (pathname === ACCESS_PATH && req.method === "POST") {
      return handleAccessSubmit(req);
    }
    // The /access page itself + the static + OAuth callbacks must be reachable
    // without a cookie (otherwise the user can never enter a password).
    if (pathname === ACCESS_PATH || isPublic(pathname)) {
      return NextResponse.next();
    }
    const cookie = req.cookies.get(GATE_COOKIE)?.value;
    const expected = await expectedCookieValue();
    if (cookie && (await timingSafeStringEqual(cookie, expected))) {
      // Valid token — shared password is the SOLE gate. Short-circuit so
      // we don't also enforce NextAuth below (which would bounce the user
      // to /login despite a valid access cookie).
      return NextResponse.next();
    }
    // Missing or wrong cookie → bounce to the access page.
    const url = req.nextUrl.clone();
    url.pathname = ACCESS_PATH;
    url.search = "";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // ─── Dev-open: skip the gate so the localhost workflow stays frictionless.
  if (isDevOpen()) return NextResponse.next();

  // ─── Strict auth (NextAuth session required) ─────────────────
  if (isPublic(pathname)) return NextResponse.next();

  const session = await auth();
  if (session?.user) return NextResponse.next();

  // API routes: 401 JSON. Pages: redirect to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Edge middleware: must also catch POST /access for form submissions.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
