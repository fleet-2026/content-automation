import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { generateAvatarVideo, type HeygenAspect } from "@/lib/ai/heygen";

export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * HeyGen avatar video — same async-poll pattern as /api/studio/video.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    await enforceRateLimit(`avatar:${userId}`, { ...RATE_LIMITS.AVATAR_GEN, label: "avatar gen" });
  } catch (e) {
    return NextResponse.json(
      { error: "rate_limited", message: (e as Error).message },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    script?: string;
    avatarId?: string;
    voiceId?: string;
    aspect?: HeygenAspect;
  } | null;
  if (!body?.script?.trim()) {
    return NextResponse.json({ error: "script required" }, { status: 400 });
  }
  if (!body.avatarId || !body.voiceId) {
    return NextResponse.json({ error: "avatarId and voiceId required" }, { status: 400 });
  }
  const aspect = body.aspect ?? "9:16";
  const sizeStr =
    aspect === "9:16" ? "720x1280" : aspect === "16:9" ? "1280x720" : "1024x1024";

  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: "VIDEO",
      prompt: body.script.trim(),
      url: "",
      model: "heygen",
      size: sizeStr,
      status: "GENERATING",
    },
  });

  after(async () => {
    try {
      const out = await generateAvatarVideo({
        userId,
        script: body.script!,
        avatarId: body.avatarId!,
        voiceId: body.voiceId!,
        aspect,
      });
      await prisma.mediaAsset.update({
        where: { id: placeholder.id },
        data: {
          url: out.url,
          width: out.width,
          height: out.height,
          durationSec: out.durationSec,
          costCents: out.costCents,
          remoteId: out.remoteId,
          model: `heygen:${out.avatarId}`,
          status: "READY",
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/api/studio/avatar] generate failed:", msg);
      await prisma.mediaAsset
        .update({
          where: { id: placeholder.id },
          data: { status: "FAILED", error: msg },
        })
        .catch(() => {});
    }
  });

  return NextResponse.json({ id: placeholder.id, status: placeholder.status });
}
