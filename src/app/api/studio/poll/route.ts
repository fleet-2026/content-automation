import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";

/**
 * GET /api/studio/poll?id=<mediaAssetId>
 *
 * Returns current status of a generation. Client polls every 3-5s while
 * status is GENERATING, stops when READY or FAILED.
 */
export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Scope by userId so one user can't poll another user's job.
  const asset = await prisma.mediaAsset.findFirst({ where: { id, userId } });
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(asset);
}
