import { NextResponse, type NextRequest } from "next/server";
import { tokenFromRequest, verifyToken } from "@/lib/auth";

// Public paths that never require auth.
const PUBLIC_PAGES = ["/login"];
const PUBLIC_API = ["/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cron endpoints authenticate with a shared secret header, not a session.
  if (pathname.startsWith("/api/cron")) return NextResponse.next();

  const isApi = pathname.startsWith("/api");
  const isPublic = isApi
    ? PUBLIC_API.some((p) => pathname.startsWith(p))
    : PUBLIC_PAGES.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const token = tokenFromRequest(req);
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
