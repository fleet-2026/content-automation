import { NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ensureDefaultUserId } from "@/lib/default-user";

export async function POST(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id ?? (await ensureDefaultUserId());
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { platform } = await ctx.params;
  const upper = platform.toUpperCase();
  if (!(upper in Platform)) return NextResponse.json({ error: "bad_platform" }, { status: 400 });

  await prisma.socialAccount.updateMany({
    where: { userId, platform: upper as Platform },
    data: { isActive: false },
  });
  return NextResponse.json({ ok: true });
}
