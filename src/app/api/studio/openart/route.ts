import { NextResponse } from "next/server";
import { after } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  generateWithOpenart,
  checkOpenartAvailability,
  isVideoModel,
  isOpenartModel,
  isOpenartAspect,
  type OpenartModel,
  type OpenartAspect,
} from "@/lib/ai/openart";

const MAX_PROMPT_CHARS = 4000;
const SAFE_CHARACTER_ID = /^[A-Za-z0-9._-]{1,64}$/;

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
    prompt?: unknown;
    model?: unknown;
    aspect?: unknown;
    durationSec?: unknown;
    imageUrl?: unknown;
    characterId?: unknown;
  } | null;

  // ─── Input validation ────────────────────────────────────────────
  // Types are erased at runtime; the lib hardens too, but failing fast
  // here avoids creating a placeholder MediaAsset for garbage input.
  const promptRaw = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!promptRaw) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  if (promptRaw.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: "prompt_too_long", message: `Max ${MAX_PROMPT_CHARS} characters.` },
      { status: 400 },
    );
  }
  if (!isOpenartModel(body?.model)) {
    return NextResponse.json({ error: "invalid_model" }, { status: 400 });
  }
  const model: OpenartModel = body.model;

  let aspect: OpenartAspect | undefined;
  if (body?.aspect !== undefined && body.aspect !== null) {
    if (!isOpenartAspect(body.aspect)) {
      return NextResponse.json({ error: "invalid_aspect" }, { status: 400 });
    }
    aspect = body.aspect;
  }

  let durationSec: number | undefined;
  if (body?.durationSec !== undefined && body.durationSec !== null) {
    const d = Number(body.durationSec);
    if (!Number.isFinite(d) || d < 1 || d > 60) {
      return NextResponse.json({ error: "invalid_duration" }, { status: 400 });
    }
    durationSec = Math.floor(d);
  }

  let imageUrl: string | undefined;
  if (body?.imageUrl !== undefined && body.imageUrl !== null) {
    if (typeof body.imageUrl !== "string" || body.imageUrl.length > 2048) {
      return NextResponse.json({ error: "invalid_image_url" }, { status: 400 });
    }
    imageUrl = body.imageUrl;
  }

  let characterId: string | undefined;
  if (body?.characterId !== undefined && body.characterId !== null && body.characterId !== "") {
    if (typeof body.characterId !== "string" || !SAFE_CHARACTER_ID.test(body.characterId)) {
      return NextResponse.json({ error: "invalid_character_id" }, { status: 400 });
    }
    characterId = body.characterId;
  }

  const kind = isVideoModel(model) ? "VIDEO" : "IMAGE";
  const sizeStr = aspect ?? "9:16";

  const placeholder = await prisma.mediaAsset.create({
    data: {
      userId,
      type: kind,
      prompt: promptRaw,
      url: "",
      model: `openart:${model}`,
      size: sizeStr,
      durationSec: kind === "VIDEO" ? durationSec ?? 5 : null,
      status: "GENERATING",
    },
  });

  after(async () => {
    try {
      const out = await generateWithOpenart({
        userId,
        prompt: promptRaw,
        model,
        aspect,
        durationSec,
        imageUrl,
        characterId,
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
