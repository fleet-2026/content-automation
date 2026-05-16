import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ensureDefaultUserId } from "@/lib/default-user";
import { syncAccount } from "@/lib/sync";

/**
 * Manual trigger: POST /api/sync/instagram (or youtube / tiktok)
 * Pulls posts for every active account on that platform.
 *
 * Runs synchronously so the user gets immediate results without needing the
 * Inngest dev server running. Heavy work (transcripts, hook extraction)
 * still happens via Inngest events fired from inside syncAccount-related code.
 */
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? (await ensureDefaultUserId());
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { platform } = await ctx.params;
  const upper = platform.toUpperCase();
  if (!(upper in Platform)) return NextResponse.json({ error: "bad_platform" }, { status: 400 });

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, platform: upper as Platform, isActive: true },
    select: { id: true },
  });

  const results = await Promise.allSettled(accounts.map((a) => syncAccount(a.id)));
  const totalSeen = results.reduce((s, r) => s + (r.status === "fulfilled" ? r.value.totalSeen : 0), 0);
  const newPosts = results.reduce((s, r) => s + (r.status === "fulfilled" ? r.value.newPostIds.length : 0), 0);
  const errors = results.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : []));

  return NextResponse.json({
    accountsTried: accounts.length,
    totalPostsSeen: totalSeen,
    newPosts,
    errors,
  });
}
