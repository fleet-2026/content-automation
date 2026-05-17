"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Loader2, Download } from "lucide-react";

/**
 * Bakes hook text onto the image using Canvas 2D, then uploads the composite
 * to R2 via /api/upload and returns the new URL.
 *
 * CORS note: drawing an off-origin image to canvas taints it unless the
 * server returns `Access-Control-Allow-Origin`. We always try `crossOrigin
 * = "anonymous"` first. If that fails, we route the original URL through
 * `/api/proxy-image` which fetches server-side and re-serves with proper
 * CORS headers, then retry. Both paths produce identical canvas output.
 */

type Position = "top" | "middle" | "bottom";
type ColorOption = "white" | "black" | "yellow";

const COLOR_HEX: Record<ColorOption, string> = {
  white: "#ffffff",
  black: "#111111",
  yellow: "#fcd34d",
};

// Inverted stroke color (for legibility). White text gets a dark stroke;
// dark text gets a light stroke. Yellow gets dark for contrast.
const STROKE_HEX: Record<ColorOption, string> = {
  white: "#000000",
  black: "#ffffff",
  yellow: "#000000",
};

export function HookOverlayEditor({
  imageUrl,
  initialHookText,
  onApply,
  onClose,
}: {
  imageUrl: string;
  initialHookText: string;
  onApply: (newImageUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [text, setText] = useState(initialHookText);
  const [position, setPosition] = useState<Position>("top");
  const [color, setColor] = useState<ColorOption>("white");
  const [fontScale, setFontScale] = useState(8); // % of image width
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ─── Load the image once ──────────────────────────────────────────────
  // We attempt the direct URL first with `crossOrigin = "anonymous"`. If the
  // image's CORS headers don't allow it, the load itself succeeds but the
  // canvas becomes tainted and `toBlob` will throw a SecurityError when we
  // try to export. To detect taint up front we draw and read 1 pixel — if
  // that throws, we reload through our proxy. Cheaper than catching at apply.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    function tryLoad(src: string, isProxy: boolean) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        imageRef.current = img;
        // Quick taint check: draw to a 1×1 canvas and getImageData.
        try {
          const test = document.createElement("canvas");
          test.width = 1;
          test.height = 1;
          const tctx = test.getContext("2d");
          if (!tctx) throw new Error("No 2d context");
          tctx.drawImage(img, 0, 0, 1, 1);
          tctx.getImageData(0, 0, 1, 1);
          // Clean — proceed to render.
          setLoading(false);
        } catch {
          if (isProxy) {
            // Even the proxy was tainted — shouldn't happen, surface error.
            setErr("Image is blocked by CORS even via proxy. Try uploading the image directly.");
            setLoading(false);
            return;
          }
          tryLoad(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`, true);
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        if (isProxy) {
          setErr("Couldn't load the image. The URL may be private or invalid.");
          setLoading(false);
        } else {
          tryLoad(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`, true);
        }
      };
      img.src = src;
    }

    tryLoad(imageUrl, false);
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // ─── Render canvas whenever inputs change ─────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    if (!text.trim()) return;

    const fontPx = Math.max(24, Math.round((canvas.width * fontScale) / 100));
    const lineHeight = Math.round(fontPx * 1.15);
    ctx.font = `bold ${fontPx}px -apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLOR_HEX[color];
    ctx.strokeStyle = STROKE_HEX[color];
    ctx.lineWidth = Math.max(2, fontPx * 0.08);
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    // Soft shadow under the stroke for readability against busy backgrounds.
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = Math.round(fontPx * 0.15);
    ctx.shadowOffsetY = Math.round(fontPx * 0.05);

    const maxWidth = canvas.width * 0.86;
    const lines = wrapText(ctx, text, maxWidth);

    const totalHeight = lines.length * lineHeight;
    let y: number;
    if (position === "top") {
      y = Math.round(canvas.height * 0.06);
    } else if (position === "bottom") {
      y = canvas.height - totalHeight - Math.round(canvas.height * 0.06);
    } else {
      y = Math.round((canvas.height - totalHeight) / 2);
    }

    const x = canvas.width / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.strokeText(lines[i], x, y + i * lineHeight);
    }
    // Disable shadow for the fill pass so the inner glyph stays crisp.
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  }, [text, position, color, fontScale]);

  useEffect(() => {
    if (!loading) render();
  }, [loading, render]);

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setApplying(true);
    setErr(null);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Canvas export failed"));
          },
          "image/jpeg",
          0.92,
        );
      });

      const fd = new FormData();
      fd.append(
        "file",
        new File([blob], `hook-overlay-${Date.now()}.jpg`, { type: "image/jpeg" }),
      );
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      const { url } = (await res.json()) as { url: string };
      onApply(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  // ─── Modal shell ──────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-surface)] border rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold">Write hook on image</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 p-5">
          {/* Canvas preview */}
          <div className="relative bg-[var(--color-surface-2)] rounded-lg overflow-hidden aspect-square md:aspect-auto md:max-h-[70vh] grid place-items-center">
            {loading && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-muted)]" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full object-contain"
              style={{ display: loading ? "none" : "block" }}
            />
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <Field label="Hook text">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] text-sm resize-y"
              />
            </Field>

            <Field label="Position">
              <div className="flex gap-2">
                {(["top", "middle", "bottom"] as Position[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPosition(p)}
                    className={
                      "flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize " +
                      (position === p
                        ? "bg-[var(--color-accent)] text-[var(--color-text-on-dark)]"
                        : "bg-[var(--color-surface-2)] hover:bg-[var(--color-border)]")
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Color">
              <div className="flex gap-2">
                {(["white", "black", "yellow"] as ColorOption[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={
                      "flex-1 px-3 py-2 rounded-lg text-xs font-medium capitalize border-2 " +
                      (color === c ? "border-[var(--color-accent)]" : "border-transparent")
                    }
                    style={{
                      backgroundColor: COLOR_HEX[c],
                      color: c === "black" ? "#fff" : "#000",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Font size — ${fontScale}% of image width`}>
              <input
                type="range"
                min={4}
                max={16}
                step={1}
                value={fontScale}
                onChange={(e) => setFontScale(Number(e.target.value))}
                className="w-full"
              />
            </Field>

            {err && (
              <div className="bg-red-100 border border-red-300 text-red-900 text-xs rounded-lg p-2.5">
                {err}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                onClick={apply}
                disabled={loading || applying || !text.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-medium text-sm disabled:opacity-50"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Apply &amp; replace media
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Greedy word wrap to maxWidth pixels using the current ctx.font. Returns
 * an array of lines (no rendering — caller does that so it can do a stroke
 * pass and a fill pass with the same lines).
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
