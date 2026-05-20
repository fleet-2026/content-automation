import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  generateVideoWithVeo,
  type VeoAspect,
  type VeoDuration,
  type VeoModel,
} from "@/lib/ai/gemini";

// Veo can take 30-300s depending on duration + queue depth. Same shape as
// the Sora route — return placeholder fast, real work via after().
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Gemini Omni video gen (Veo 3) endpoint.
 *
 *   1. requireUser + rate-limit (shared VIDEO_GEN bucket)
 *   2. Insert MediaAsset placeholder with status=GENERATING
 *   3. after() runs generateVideoWithVeo, polling Google's long-running
 *      operation API until done, downloads the MP4, uploads to R2,
 *      flips the row to READY (or FAILED with the error message)
 *   4. Client polls /api/studio/poll?id=… same way Sora flow works.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    await enforceRateLimit(`videogen:${userId}`, {
      ...RATE_LIMITS.VIDEO_GEN,
      label: "Gemini video gen",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "rate_limited", message: (e as Error).message },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    aspectRatio?: VeoAspect;
    durationSec?: VeoDuration;
    model?: VeoModel;
  } | null;
  if (!body?.prompt?.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  const aspectRatio: VeoAspect = body.aspectRatio ?? "9:16";
  const durationSec: VeoDuration = (body.durationSec === 4 || body.durationSec === 8) ? body.durationSec : 8;
  const model: VeoModel = body.model ?? "veo-3.0-fast-generate-preview";

  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: "VIDEO",
      prompt: body.prompt.trim(),
      url: "",
      model,
      size: aspectRatio,
      durationSec,
      status: "GENERATING",
    },
  });

  after(async () => {
    try {
      const out = await generateVideoWithVeo({
        userId,
        prompt: body.prompt!.trim(),
        aspectRatio,
        durationSec,
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
      console.error("[/api/studio/gemini-video] generate failed:", msg);
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
