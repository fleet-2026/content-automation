import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  generateVideo,
  type VideoSize,
  type VideoSeconds,
  type VideoModel,
} from "@/lib/ai/video-gen";

// Sora can take 1-3 minutes. Bump function timeout. (Pro / Fluid Compute.)
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Async-poll pattern:
 *  1. Create MediaAsset placeholder with status=GENERATING, return immediately
 *  2. Background work via `after()` runs the long Sora job + updates the row
 *  3. Client polls /api/studio/poll?id=… until status=READY|FAILED
 *
 * This is what fixes the C4 504 timeout — the placeholder is returned in
 * <1 second; the real work happens after the response is sent.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    await enforceRateLimit(`videogen:${userId}`, { ...RATE_LIMITS.VIDEO_GEN, label: "video gen" });
  } catch (e) {
    return NextResponse.json(
      { error: "rate_limited", message: (e as Error).message },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    size?: VideoSize;
    seconds?: VideoSeconds;
    model?: VideoModel;
  } | null;
  if (!body?.prompt?.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  const size = body.size ?? "720x1280";
  const seconds = body.seconds ?? "4";
  const model = body.model ?? "sora-2";

  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: "VIDEO",
      prompt: body.prompt.trim(),
      url: "",
      model,
      size,
      durationSec: parseInt(seconds, 10),
      status: "GENERATING",
    },
  });

  // Background — runs after the response is sent. Bound by maxDuration.
  after(async () => {
    try {
      const out = await generateVideo({
        userId,
        prompt: body.prompt!.trim(),
        size,
        seconds,
        model,
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
          status: "READY",
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/api/studio/video] generate failed:", msg);
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
