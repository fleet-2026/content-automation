import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { uploadToR2 } from "@/lib/r2";

/**
 * OpenArt integration via local Playwright browser automation.
 *
 * OpenArt has no public API. The workaround is a Python script at
 * `C:\Users\serka\namaha\scripts\openart_video.py` that drives the OpenArt
 * web UI through a persistent Chrome profile.
 *
 * IMPORTANT: this ONLY works on the local dev machine where the script,
 * the Python venv, Playwright, real Chrome, and the logged-in profile all
 * exist together. It CANNOT run on Vercel — there is no Chrome, no profile,
 * no persistent disk for the queue file.
 *
 * Configuration (in .env.local):
 *   OPENART_NAMAHA_PATH=C:\Users\serka\namaha
 *   OPENART_PYTHON=C:\Users\serka\namaha\.venv\Scripts\python.exe
 *     (or just "python" if .venv is on PATH)
 *
 * Flow:
 *   1. spawn `python openart_video.py add <prompt> --model X --aspect Y ...`
 *   2. parse the queue id from stdout
 *   3. spawn `python openart_video.py generate --id <id>` (long-running)
 *   4. poll for output file at data/openart_videos/<id>.{mp4|png|jpg}
 *   5. upload to R2 + return URL
 */

export type OpenartVideoModel = "veo3" | "sora-v2" | "kling" | "hailuo" | "seedance" | "wan";
export type OpenartImageModel =
  | "flux-pro"
  | "flux-kontext"
  | "flux-dev"
  | "gpt-image"
  | "gemini"
  | "imagen-4"
  | "sdxl";
export type OpenartModel = OpenartVideoModel | OpenartImageModel;
export type OpenartAspect = "9:16" | "16:9" | "1:1" | "4:5" | "3:4";

const VIDEO_MODELS: OpenartVideoModel[] = ["veo3", "sora-v2", "kling", "hailuo", "seedance", "wan"];

export function isVideoModel(m: string): m is OpenartVideoModel {
  return (VIDEO_MODELS as string[]).includes(m);
}

function getNamahaPath(): string {
  return process.env.OPENART_NAMAHA_PATH ?? "C:\\Users\\serka\\namaha";
}

function getPython(): string {
  // If OPENART_PYTHON is set explicitly, use it. Otherwise default to the
  // venv path under namaha (the recipe documents .venv\Scripts\python.exe).
  if (process.env.OPENART_PYTHON) return process.env.OPENART_PYTHON;
  return path.join(getNamahaPath(), ".venv", "Scripts", "python.exe");
}

function getScriptPath(): string {
  return path.join(getNamahaPath(), "scripts", "openart_video.py");
}

function getOutputDir(): string {
  return path.join(getNamahaPath(), "data", "openart_videos");
}

/**
 * Verify that the local OpenArt setup actually exists on this machine.
 * Returns a structured result so the UI can show a clear error instead of
 * crashing when running on Vercel or a freshly-cloned dev env.
 */
export async function checkOpenartAvailability(): Promise<{
  available: boolean;
  reason?: string;
  scriptPath: string;
  python: string;
}> {
  const scriptPath = getScriptPath();
  const python = getPython();

  // Never even try in production — the script paths point at a Windows
  // dev machine that doesn't exist on Vercel's Linux runners.
  if (process.env.NODE_ENV === "production") {
    return {
      available: false,
      reason:
        "OpenArt runs via local browser automation and isn't supported on Vercel. Use a different video provider in prod, or generate locally and upload the MP4.",
      scriptPath,
      python,
    };
  }

  try {
    await fs.access(scriptPath);
  } catch {
    return {
      available: false,
      reason: `Script not found at ${scriptPath}. Set OPENART_NAMAHA_PATH in .env.local to point at your namaha checkout.`,
      scriptPath,
      python,
    };
  }
  try {
    await fs.access(python);
  } catch {
    return {
      available: false,
      reason: `Python not found at ${python}. Set OPENART_PYTHON in .env.local to point at your venv's python.exe.`,
      scriptPath,
      python,
    };
  }
  return { available: true, scriptPath, python };
}

/** Run a child process and capture stdout. Resolves on exit. */
function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error(`OpenArt subprocess timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Parse `+ queued <id>  [kind] model mode  prompt...` for the id. */
function parseQueueId(stdout: string): string | null {
  const m = stdout.match(/\+\s*queued\s+([a-z0-9-]{8,16})\b/i);
  return m ? m[1] : null;
}

/** Wait for the output file with the matching id to appear. */
async function waitForOutput(
  outputDir: string,
  id: string,
  exts: string[],
  timeoutMs: number,
  pollMs = 2000,
): Promise<{ filePath: string; ext: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const ext of exts) {
      const candidate = path.join(outputDir, `${id}.${ext}`);
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile() && stat.size > 0) {
          // Give it a tiny grace window to make sure the write fully landed
          await new Promise((r) => setTimeout(r, 500));
          return { filePath: candidate, ext };
        }
      } catch {
        // file not there yet
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `OpenArt output never appeared (waited ${timeoutMs / 1000}s) at ${outputDir}/${id}.{${exts.join(",")}}`,
  );
}

export type OpenartGenerationResult = {
  remoteId: string;       // OpenArt queue id (random 12-char)
  url: string;            // R2 public URL after upload
  mime: string;
  kind: "video" | "image";
  model: OpenartModel;
  prompt: string;
};

/**
 * End-to-end: queue a job, run it, wait for output, copy to R2.
 * Heavy operation — typical 30-120s for video, 10-30s for image.
 *
 * The caller is expected to wrap this in waitUntil()/after() so the
 * function lifetime extends past response, and to update a MediaAsset
 * row with the result.
 */
export async function generateWithOpenart(input: {
  userId: string;
  prompt: string;
  model: OpenartModel;
  aspect?: OpenartAspect;
  durationSec?: number;
  imageUrl?: string;       // optional — for i2v / i2i
  characterId?: string;    // image only
  timeoutMs?: number;
}): Promise<OpenartGenerationResult> {
  const avail = await checkOpenartAvailability();
  if (!avail.available) {
    throw new Error(avail.reason ?? "OpenArt is not available on this machine.");
  }
  if (!input.prompt?.trim()) throw new Error("Prompt is required.");

  const kind = isVideoModel(input.model) ? "video" : "image";
  const namaha = getNamahaPath();
  const python = getPython();
  const scriptPath = getScriptPath();
  const outputDir = getOutputDir();
  // Bounded BELOW the API route's maxDuration=300 so the subprocess fails
  // gracefully INSIDE our try/catch instead of getting axe'd by Vercel
  // mid-render — which would leave the placeholder MediaAsset stuck in
  // status=GENERATING forever (since the `after()` block never reaches its
  // catch). 4 min covers Veo 3 / Sora-v2 cold starts in practice.
  const timeoutMs = input.timeoutMs ?? 4 * 60 * 1000;

  // Optional: download the reference image to a local temp file. The CLI
  // accepts --image PATH so we need a real file, not a URL.
  let localImagePath: string | undefined;
  if (input.imageUrl) {
    const r = await fetch(input.imageUrl);
    if (!r.ok) throw new Error(`Failed to download reference image: ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const tmpDir = path.join(namaha, "data", "openart_tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const ext = (r.headers.get("content-type")?.includes("png") ? "png" : "jpg");
    localImagePath = path.join(tmpDir, `${crypto.randomBytes(6).toString("hex")}.${ext}`);
    await fs.writeFile(localImagePath, buf);
  }

  // ─── Step 1: add to queue ─────────────────────────────────
  const addArgs = [
    scriptPath,
    "add",
    input.prompt,
    "--model",
    input.model,
    "--aspect",
    input.aspect ?? (kind === "video" ? "9:16" : "1:1"),
    "--duration",
    String(input.durationSec ?? 5),
  ];
  if (localImagePath) addArgs.push("--image", localImagePath);
  if (input.characterId) addArgs.push("--character-id", input.characterId);

  const addRes = await run(python, addArgs, namaha, 30_000);
  if (addRes.code !== 0) {
    throw new Error(
      `OpenArt add failed (exit ${addRes.code}). stderr: ${addRes.stderr.slice(0, 500)}`,
    );
  }
  const queueId = parseQueueId(addRes.stdout);
  if (!queueId) {
    throw new Error(`OpenArt add returned no queue id. stdout: ${addRes.stdout.slice(0, 500)}`);
  }

  // ─── Step 2: kick off generate (waits for completion) ─────
  // We run generate synchronously here — it's a long-running browser session.
  // Caller MUST be inside waitUntil()/after() or this will exceed the
  // Vercel function timeout (but we already refused to run in prod above).
  const genArgs = [scriptPath, "generate", "--id", queueId];
  const genPromise = run(python, genArgs, namaha, timeoutMs);

  // ─── Step 3: wait for output to land ─────────────────────
  // Two-tracked wait: whichever happens first.
  //   - subprocess exits with 0 → output should be on disk
  //   - subprocess exits with non-zero → fail fast
  //   - output file appears before subprocess exits → also fine
  const exts = kind === "video" ? ["mp4", "webm", "mov"] : ["png", "jpg", "jpeg", "webp"];
  const filePromise = waitForOutput(outputDir, queueId, exts, timeoutMs);

  const [gen, file] = await Promise.allSettled([genPromise, filePromise]);

  if (file.status === "rejected") {
    const genInfo =
      gen.status === "fulfilled"
        ? `subprocess exited ${gen.value.code}. stderr: ${gen.value.stderr.slice(0, 400)}`
        : `subprocess also failed: ${gen.reason instanceof Error ? gen.reason.message : String(gen.reason)}`;
    throw new Error(`OpenArt: ${file.reason instanceof Error ? file.reason.message : String(file.reason)}. ${genInfo}`);
  }
  if (gen.status === "fulfilled" && gen.value.code !== 0) {
    // Output file exists but subprocess errored — could be a redirect-to-login
    // (session expired) where the script wrote a stub. Surface the error.
    const tail = gen.value.stderr.slice(-300) || gen.value.stdout.slice(-300);
    if (/login/i.test(tail)) {
      throw new Error(
        "OpenArt session expired. From the namaha repo run: python scripts/openart_video.py login",
      );
    }
    // Otherwise the file did land; warn but continue.
    console.warn(`[openart] subprocess exited ${gen.value.code} but output exists. tail: ${tail}`);
  }

  // ─── Step 4: upload to R2 ─────────────────────────────────
  const { filePath, ext } = file.value;
  const buf = await fs.readFile(filePath);
  const mime =
    ext === "mp4"
      ? "video/mp4"
      : ext === "webm"
        ? "video/webm"
        : ext === "mov"
          ? "video/quicktime"
          : ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
  const r2Key = `studio/${input.userId}/openart-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  const url = await uploadToR2(r2Key, buf, mime);

  return {
    remoteId: queueId,
    url,
    mime,
    kind,
    model: input.model,
    prompt: input.prompt.trim(),
  };
}
