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
const IMAGE_MODELS: OpenartImageModel[] = [
  "flux-pro",
  "flux-kontext",
  "flux-dev",
  "gpt-image",
  "gemini",
  "imagen-4",
  "sdxl",
];
const ALL_MODELS: OpenartModel[] = [...VIDEO_MODELS, ...IMAGE_MODELS];
const ASPECTS: OpenartAspect[] = ["9:16", "16:9", "1:1", "4:5", "3:4"];

export function isVideoModel(m: string): m is OpenartVideoModel {
  return (VIDEO_MODELS as string[]).includes(m);
}

export function isOpenartModel(m: unknown): m is OpenartModel {
  return typeof m === "string" && (ALL_MODELS as string[]).includes(m);
}

export function isOpenartAspect(a: unknown): a is OpenartAspect {
  return typeof a === "string" && (ASPECTS as string[]).includes(a);
}

// Argv hardening — refuse anything that smells like an option or path-escape.
// spawn() is non-shell so we can't be shell-injected, but a value like
// "--reverse" would be parsed as an option by the Python script. Same for
// path-traversal characters in ids.
const SAFE_TOKEN_RE = /^[A-Za-z0-9._-]+$/;
const SAFE_QUEUE_ID_RE = /^[a-z0-9]{8,16}$/i;

function assertSafeToken(value: string, field: string): void {
  if (!SAFE_TOKEN_RE.test(value) || value.startsWith("-")) {
    throw new Error(`Invalid ${field}: must match [A-Za-z0-9._-] and not start with '-'.`);
  }
}

// Cap so a runaway prompt doesn't exceed Windows argv (~32k) or get logged.
const MAX_PROMPT_CHARS = 4000;

// Redact obvious secrets before logging subprocess output. Best-effort only.
function redactForLog(s: string): string {
  return s
    .replace(/(?:cookie|set-cookie|authorization|x-csrf-token|x-api-key)\s*[:=]\s*[^\s,;]+/gi, "$&"
      .replace(/[:=].*$/, "=[redacted]"))
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted-jwt]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[redacted-key]");
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

/** Hard cap on captured stdio so misbehaving scripts can't blow our heap. */
const MAX_CAPTURE_BYTES = 256 * 1024; // 256 KiB

type RunHandle = {
  promise: Promise<{ code: number; stdout: string; stderr: string }>;
  kill: () => void;
};

/**
 * Run a child process and capture stdout/stderr (size-capped).
 * Returns both the promise AND a kill() handle so callers can terminate
 * orphan subprocesses (e.g. when a sibling promise wins a race).
 */
function runWithHandle(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): RunHandle {
  let resolveFn!: (v: { code: number; stdout: string; stderr: string }) => void;
  let rejectFn!: (e: Error) => void;
  const promise = new Promise<{ code: number; stdout: string; stderr: string }>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  const child = spawn(cmd, args, { cwd, windowsHide: true });
  let stdout = "";
  let stderr = "";
  let killed = false;
  let settled = false;

  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };

  const timer = setTimeout(() => {
    killed = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
    settle(() =>
      rejectFn(new Error(`OpenArt subprocess timed out after ${timeoutMs / 1000}s`)),
    );
  }, timeoutMs);

  child.stdout.on("data", (d: Buffer) => {
    if (stdout.length < MAX_CAPTURE_BYTES) {
      stdout += d.toString("utf8");
      if (stdout.length > MAX_CAPTURE_BYTES) stdout = stdout.slice(0, MAX_CAPTURE_BYTES);
    }
  });
  child.stderr.on("data", (d: Buffer) => {
    if (stderr.length < MAX_CAPTURE_BYTES) {
      stderr += d.toString("utf8");
      if (stderr.length > MAX_CAPTURE_BYTES) stderr = stderr.slice(0, MAX_CAPTURE_BYTES);
    }
  });
  child.on("error", (e) => settle(() => rejectFn(e)));
  child.on("close", (code) =>
    settle(() => resolveFn({ code: killed ? -1 : code ?? -1, stdout, stderr })),
  );

  const kill = () => {
    if (settled) return;
    killed = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  };

  return { promise, kill };
}

/** Run a child process and capture stdout. Resolves on exit. */
function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runWithHandle(cmd, args, cwd, timeoutMs).promise;
}

/**
 * Parse `+ queued <id>  [kind] model mode  prompt...` for the id.
 * Strictly alphanumeric — no dashes, no path-escape characters.
 */
function parseQueueId(stdout: string): string | null {
  const m = stdout.match(/\+\s*queued\s+([a-z0-9]{8,16})\b/i);
  if (!m) return null;
  const id = m[1];
  if (!SAFE_QUEUE_ID_RE.test(id)) return null;
  return id;
}

/**
 * Wait for the output file with the matching id to appear.
 * `signal` lets the caller cancel polling (e.g. when the subprocess fails fast).
 */
async function waitForOutput(
  outputDir: string,
  id: string,
  exts: string[],
  timeoutMs: number,
  pollMs = 2000,
  signal?: AbortSignal,
): Promise<{ filePath: string; ext: string }> {
  // Defence-in-depth: the id should already be validated by parseQueueId,
  // but re-check that the resolved path stays inside outputDir.
  const resolvedDir = path.resolve(outputDir);
  if (!SAFE_QUEUE_ID_RE.test(id)) {
    throw new Error("Refusing to poll: queue id failed safety check.");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("OpenArt: polling aborted.");
    for (const ext of exts) {
      const candidate = path.resolve(resolvedDir, `${id}.${ext}`);
      // Path-traversal guard: candidate must be a direct child of outputDir.
      if (path.dirname(candidate) !== resolvedDir) {
        throw new Error("Refusing to read: resolved path escaped output dir.");
      }
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
  // Belt-and-braces: re-check NODE_ENV here in case checkOpenartAvailability
  // ever gets refactored. The spawn() path must never run in prod.
  if (process.env.NODE_ENV === "production") {
    throw new Error("OpenArt cannot run in production.");
  }

  // ─── Input validation (defence-in-depth — types are erased at runtime) ───
  if (!input.prompt?.trim()) throw new Error("Prompt is required.");
  const prompt = input.prompt.trim();
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt is too long (max ${MAX_PROMPT_CHARS} chars).`);
  }
  if (!isOpenartModel(input.model)) {
    throw new Error(`Invalid model: must be one of ${ALL_MODELS.join(", ")}.`);
  }
  if (input.aspect && !isOpenartAspect(input.aspect)) {
    throw new Error(`Invalid aspect: must be one of ${ASPECTS.join(", ")}.`);
  }
  const durationSec = Math.max(1, Math.min(60, Math.floor(input.durationSec ?? 5)));
  if (!Number.isFinite(durationSec)) {
    throw new Error("Invalid duration.");
  }
  if (input.characterId) {
    assertSafeToken(input.characterId, "characterId");
  }
  if (!input.userId || !/^[A-Za-z0-9_-]{1,128}$/.test(input.userId)) {
    throw new Error("Invalid userId.");
  }

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
    // SSRF guard: only allow https:// to public hosts. Block private ranges
    // and link-local addresses. (Dev machines have internal services we
    // don't want to expose via a prompt-controlled URL.)
    let parsed: URL;
    try {
      parsed = new URL(input.imageUrl);
    } catch {
      throw new Error("Invalid reference image URL.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Reference image URL must be http(s).");
    }
    const host = parsed.hostname.toLowerCase();
    const isPrivate =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.endsWith(".local") ||
      host.endsWith(".internal");
    if (isPrivate) {
      throw new Error("Reference image URL points at a private/internal host.");
    }

    // Bounded fetch: timeout + size cap (10 MB).
    const ac = new AbortController();
    const fetchTimeout = setTimeout(() => ac.abort(), 20_000);
    let r: Response;
    try {
      r = await fetch(parsed.toString(), { signal: ac.signal, redirect: "follow" });
    } finally {
      clearTimeout(fetchTimeout);
    }
    if (!r.ok) throw new Error(`Failed to download reference image: ${r.status}`);
    const contentType = r.headers.get("content-type") ?? "";
    if (!/^image\//i.test(contentType)) {
      throw new Error(`Reference URL is not an image (content-type: ${contentType || "unknown"}).`);
    }
    const MAX_IMG_BYTES = 10 * 1024 * 1024;
    const declared = Number(r.headers.get("content-length") ?? 0);
    if (declared > MAX_IMG_BYTES) {
      throw new Error("Reference image is too large (max 10 MB).");
    }
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_IMG_BYTES) {
      throw new Error("Reference image is too large (max 10 MB).");
    }
    const buf = Buffer.from(ab);
    const tmpDir = path.join(namaha, "data", "openart_tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    localImagePath = path.join(tmpDir, `${crypto.randomBytes(8).toString("hex")}.${ext}`);
    await fs.writeFile(localImagePath, buf);
  }

  // Cleanup helper for the optional reference-image tmp file. Best-effort.
  const cleanupTmp = async () => {
    if (!localImagePath) return;
    try {
      await fs.unlink(localImagePath);
    } catch {
      // ignore
    }
  };

  try {
    // ─── Step 1: add to queue ─────────────────────────────────
    const addArgs = [
      scriptPath,
      "add",
      prompt,
      "--model",
      input.model,
      "--aspect",
      input.aspect ?? (kind === "video" ? "9:16" : "1:1"),
      "--duration",
      String(durationSec),
    ];
    if (localImagePath) addArgs.push("--image", localImagePath);
    if (input.characterId) addArgs.push("--character-id", input.characterId);

    const addRes = await run(python, addArgs, namaha, 30_000);
    if (addRes.code !== 0) {
      throw new Error(
        `OpenArt add failed (exit ${addRes.code}). stderr: ${redactForLog(addRes.stderr).slice(0, 500)}`,
      );
    }
    const queueId = parseQueueId(addRes.stdout);
    if (!queueId) {
      throw new Error(
        `OpenArt add returned no queue id. stdout: ${redactForLog(addRes.stdout).slice(0, 500)}`,
      );
    }

    // ─── Step 2: kick off generate (waits for completion) ─────
    // Long-running browser session. We hold a kill handle so the subprocess
    // can be terminated if the file-poll promise rejects first (no orphans).
    const genArgs = [scriptPath, "generate", "--id", queueId];
    const genHandle = runWithHandle(python, genArgs, namaha, timeoutMs);

    // ─── Step 3: wait for output to land ─────────────────────
    // Two-tracked wait: whichever happens first.
    const exts = kind === "video" ? ["mp4", "webm", "mov"] : ["png", "jpg", "jpeg", "webp"];
    const pollAbort = new AbortController();
    const filePromise = waitForOutput(outputDir, queueId, exts, timeoutMs, 2000, pollAbort.signal);

    const [gen, file] = await Promise.allSettled([genHandle.promise, filePromise]);

    // If polling rejected, the subprocess may still be running — kill it.
    if (file.status === "rejected" && gen.status !== "fulfilled") {
      genHandle.kill();
    }
    // If polling succeeded, stop polling (no-op now, but defensive).
    pollAbort.abort();

    if (file.status === "rejected") {
      const genInfo =
        gen.status === "fulfilled"
          ? `subprocess exited ${gen.value.code}. stderr: ${redactForLog(gen.value.stderr).slice(0, 400)}`
          : `subprocess also failed: ${gen.reason instanceof Error ? gen.reason.message : String(gen.reason)}`;
      throw new Error(
        `OpenArt: ${file.reason instanceof Error ? file.reason.message : String(file.reason)}. ${genInfo}`,
      );
    }
    if (gen.status === "fulfilled" && gen.value.code !== 0) {
      // Output file exists but subprocess errored — could be a redirect-to-login
      // (session expired) where the script wrote a stub. Surface the error.
      const rawTail = gen.value.stderr.slice(-300) || gen.value.stdout.slice(-300);
      const tail = redactForLog(rawTail);
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
      prompt,
    };
  } finally {
    await cleanupTmp();
  }
}
