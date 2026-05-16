import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  generateWithOpenart,
  checkOpenartAvailability,
  isVideoModel,
  type OpenartModel,
  type OpenartAspect,
} from "@/lib/ai/openart";

/**
 * OpenArt generation route. Same async-poll pattern as /api/studio/video:
 * placeholder MediaAsset returned immediately, real work runs in `after()`.
 *
 * Local-only: refuses to run on Vercel because Playwright + the OpenArt
 * profile only exist on the dev machine. The route still exists in prod
 * so the UI gets a clean "not available" response instead of a 404.
 */
export const maxDuration = 300; // 5 min — same as /api/studio/video
export const runtime = "nodejs";

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Refuse early in prod / when script is missing. UI shows the reason verbatim.
  const avail = await checkOpenartAvailability();
  if (!avail.available) {
    return NextResponse.json(
      { error: "openart_unavailable", message: avail.reason },
      { status: 503 },
    );
  }

  try {
    // Same cap as Sora — OpenArt drains paid credits per generation.
    await enforceRateLimit(`openart:${userId}`, { ...RATE_LIMITS.VIDEO_GEN, label: "openart" });
  } catch (e) {
    return NextResponse.json(
      { error: "rate_limited", message: (e as Error).message },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    prompt?: string;
    model?: OpenartModel;
    aspect?: OpenartAspect;
    durationSec?: number;
    imageUrl?: string;
    characterId?: string;
  } | null;
  if (!body?.prompt?.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  if (!body.model) {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  const kind = isVideoModel(body.model) ? "VIDEO" : "IMAGE";
  const sizeStr = `${body.aspect ?? "9:16"}`;

  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: kind,
      prompt: body.prompt.trim(),
      url: "",
      model: `openart:${body.model}`,
      size: sizeStr,
      durationSec: kind === "VIDEO" ? body.durationSec ?? 5 : null,
      status: "GENERATING",
    },
  });

  after(async () => {
    try {
      const out = await generateWithOpenart({
        userId,
        prompt: body.prompt!.trim(),
        model: body.model!,
        aspect: body.aspect,
        durationSec: body.durationSec,
        imageUrl: body.imageUrl,
        characterId: body.characterId,
      });
      await prisma.mediaAsset.update({
        where: { id: placeholder.id },
        data: {
          url: out.url,
          remoteId: out.remoteId,
          status: "READY",
          model: `openart:${out.model}`,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[/api/studio/openart] generate failed:", msg);
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

/**
 * GET /api/studio/openart — returns availability so the UI can hide the tab
 * (or show a "not configured" notice) without a POST attempt.
 */
export async function GET() {
  const avail = await checkOpenartAvailability();
  return NextResponse.json({
    available: avail.available,
    reason: avail.reason ?? null,
    videoModels: ["veo3", "sora-v2", "kling", "hailuo", "seedance", "wan"],
    imageModels: ["flux-pro", "flux-kontext", "flux-dev", "gpt-image", "gemini", "imagen-4", "sdxl"],
  });
}
