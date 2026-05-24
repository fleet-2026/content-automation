/**
 * GuideReel — main Remotion composition for a daily guide.
 *
 * Layers (bottom → top):
 *   1. HeyGen talking-head video, wrapped in a transform for punch-in
 *      zooms during emphasis moments.
 *   2. Realistic Claude UI mockup picture-in-picture at scripted moments
 *      (when the speaker references Claude / prompts / AI tools).
 *   3. Logo reveals — animated brand logos with glow/scale entrance.
 *   4. Kinetic captions — word-by-word reveal with emphasis-word
 *      highlight + dynamic resize. Premium typography (Fraunces +
 *      Inter), warm mustard accent.
 *
 * All timings are passed in as a plan via props.edit — the bundler /
 * orchestrator generates that plan from the script + Claude before
 * triggering renderMedia.
 */
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  spring,
  staticFile,
  Img,
} from "remotion";

// ─── Edit Plan Schema ───────────────────────────────────────────

export type CaptionWord = {
  text: string;
  startSec: number;
  endSec: number;
  emphasis?: boolean; // larger + colored
};

export type Emphasis = {
  startSec: number;
  endSec: number;
  text: string; // for accessibility, not displayed
};

export type PunchIn = {
  startSec: number;
  endSec: number;
  zoom: number; // 1.0 = no zoom, 1.15 = 15% in
  focusX?: number; // 0-1, default 0.5
  focusY?: number; // 0-1, default 0.4 (slightly above center for faces)
};

export type LogoReveal = {
  startSec: number;
  endSec: number;
  // URL of the PNG (R2-hosted or weserv-proxied)
  src: string;
  // Position bucket: "tr" = top-right, "tl" = top-left, "tc" = top-center
  position: "tr" | "tl" | "tc";
};

export type UIMockup = {
  startSec: number;
  endSec: number;
  // What to render inside the mockup. Keep it short — fits a phone-frame.
  kind: "claude-chat";
  userMessage: string;
  assistantReply: string;
};

export type HookCard = {
  startSec: number;
  endSec: number;
  // Big top line — punchy hook phrase
  headline: string;
  // Smaller line below — subtitle / context
  subtitle?: string;
};

export type EditPlan = {
  captions: CaptionWord[];
  emphasis: Emphasis[];
  punchIns: PunchIn[];
  logos: LogoReveal[];
  uiMockups: UIMockup[];
  hookCard?: HookCard;
};

export type GuideReelProps = {
  videoUrl: string;
  durationSec: number;
  script: string;
  title: string;
  edit: EditPlan;
};

// ─── Component ──────────────────────────────────────────────────

export const GuideReel: React.FC<GuideReelProps> = ({
  videoUrl,
  edit,
  durationSec,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps; // current time in seconds

  // Find the active punch-in for the current time, if any.
  const activePunch = edit.punchIns.find((p) => t >= p.startSec && t <= p.endSec);
  const zoom = activePunch?.zoom ?? 1;
  const focusX = activePunch?.focusX ?? 0.5;
  const focusY = activePunch?.focusY ?? 0.42;

  // Smoothly interpolate zoom in/out over a 6-frame ramp so the punch
  // doesn't pop hard — closer to a real editor's "cinematic" feel.
  const zoomEased = activePunch
    ? interpolate(
        t,
        [
          activePunch.startSec - 0.2,
          activePunch.startSec,
          activePunch.endSec,
          activePunch.endSec + 0.2,
        ],
        [1, zoom, zoom, 1],
        { easing: Easing.bezier(0.4, 0, 0.2, 1), extrapolateRight: "clamp", extrapolateLeft: "clamp" },
      )
    : 1;

  // Transform origin is the focus point — punch zooms toward the face
  // not the center of the frame.
  const transformOrigin = `${focusX * 100}% ${focusY * 100}%`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0c0805" }}>
      {/* 1. Talking head — STATIC (no punch-in zoom). The zoom transform
             was making the face appear to jump position when scenes
             crossed punch-in moments. Talking heads work best when
             they're locked. */}
      <AbsoluteFill>
        <OffthreadVideo
          src={
            // The orchestrator prefixes "STATIC:" when the source is a
            // local file copied into remotion/public/ — staticFile()
            // turns it into the right bundler URL at runtime. Remote
            // URLs (http://, https://) pass through unchanged.
            videoUrl.startsWith("STATIC:")
              ? staticFile(videoUrl.slice("STATIC:".length))
              : videoUrl
          }
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </AbsoluteFill>

      {/* 2. Claude UI mockups (PiP) */}
      {edit.uiMockups.map((m, i) => (
        <UIMockupOverlay key={i} mockup={m} t={t} fps={fps} />
      ))}

      {/* 3. Logo reveals */}
      {edit.logos.map((l, i) => (
        <LogoOverlay key={i} logo={l} t={t} fps={fps} />
      ))}

      {/* 4. Kinetic captions (always on top) */}
      <CaptionLayer captions={edit.captions} t={t} fps={fps} height={height} width={width} />

      {/* 5. Hook card — full-frame intro that doubles as a cover for any
             early talking-head artifacts (eye glitches in the first photo,
             etc.). Always renders LAST so it sits above all other layers. */}
      {edit.hookCard && (
        <HookCardLayer card={edit.hookCard} t={t} fps={fps} />
      )}
    </AbsoluteFill>
  );
};

// ─── Sub-components ─────────────────────────────────────────────

/** Word-by-word caption with emphasis-word highlight + dynamic scale.
 *  Renders a "running window" of ~5-6 words around the current time.
 *  Premium typography: Inter for body, Fraunces italic for emphasis. */
const CaptionLayer: React.FC<{
  captions: CaptionWord[];
  t: number;
  fps: number;
  height: number;
  width: number;
}> = ({ captions, t, height, width }) => {
  // Show ONE PHRASE at a time, grouped in fixed chunks of 3 words so
  // the visible text never reflows mid-chunk. Each chunk holds for
  // ~0.7s then swaps out for the next 3-word chunk. Container is a
  // FIXED-HEIGHT box so even when the chunk shrinks/grows, the surrounding
  // video position doesn't shift.
  if (captions.length === 0) return null;
  const CHUNK_SIZE = 3;
  // Build chunks once — pure derived data; the time-finder below
  // selects which chunk to render at the current frame.
  const chunks: { text: string; emphasisAny: boolean; startSec: number; endSec: number }[] = [];
  for (let i = 0; i < captions.length; i += CHUNK_SIZE) {
    const slice = captions.slice(i, i + CHUNK_SIZE);
    if (slice.length === 0) continue;
    chunks.push({
      text: slice.map((s) => s.text).join(" "),
      emphasisAny: slice.some((s) => s.emphasis),
      startSec: slice[0].startSec,
      endSec: slice[slice.length - 1].endSec,
    });
  }
  const active = chunks.find((c) => t >= c.startSec && t < c.endSec);
  // No transition between chunks — just appear/disappear. No fade,
  // no scale, no slide. The text simply changes.

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // Mid-chest height — fixed pixel offset, never moves.
        top: height * 0.66,
        // FIXED height so the surrounding container doesn't reflow when
        // text wraps to a second line or not.
        height: 180,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "0 60px",
        // Pointer-events none so the canvas-like layer doesn't intercept
        // anything weird during preview.
        pointerEvents: "none",
      }}
    >
      {active && (
        <span
          // Key by chunk index — forces React to render a fresh span on
          // chunk change, no cross-fade weirdness.
          key={active.startSec}
          style={{
            fontFamily: active.emphasisAny
              ? "'Fraunces', 'Playfair Display', Georgia, serif"
              : "'Inter', system-ui, sans-serif",
            fontWeight: active.emphasisAny ? 800 : 700,
            fontStyle: active.emphasisAny ? "italic" : "normal",
            fontSize: active.emphasisAny ? 60 : 52,
            color: active.emphasisAny ? "#E8C56B" : "#F5EFE6",
            lineHeight: 1.1,
            textShadow: "0 2px 8px rgba(0,0,0,0.7)",
            letterSpacing: active.emphasisAny ? "-0.01em" : "0",
            textAlign: "center",
            // Cap width so phrases never run edge-to-edge — keeps line
            // breaks predictable.
            maxWidth: width * 0.78,
          }}
        >
          {active.text}
        </span>
      )}
    </div>
  );
};

/** Animated logo reveal — fades + scales in, holds, fades out. */
const LogoOverlay: React.FC<{ logo: LogoReveal; t: number; fps: number }> = ({
  logo,
  t,
}) => {
  if (t < logo.startSec - 0.4 || t > logo.endSec + 0.4) return null;

  // Fade in 0.3s, fade out 0.3s
  const alpha = interpolate(
    t,
    [logo.startSec - 0.3, logo.startSec, logo.endSec, logo.endSec + 0.3],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Scale up subtly on entry then settle.
  const scaleVal = interpolate(
    t,
    [logo.startSec - 0.3, logo.startSec - 0.05, logo.startSec + 0.2, logo.endSec, logo.endSec + 0.3],
    [0.6, 1.08, 1.0, 1.0, 0.9],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const posStyles: Record<LogoReveal["position"], React.CSSProperties> = {
    tr: { top: 60, right: 40 },
    tl: { top: 60, left: 40 },
    tc: { top: 60, left: "50%", transform: `translateX(-50%) scale(${scaleVal})` },
  };
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    width: 140,
    height: 140,
    opacity: alpha,
    transform: logo.position === "tc" ? undefined : `scale(${scaleVal})`,
    transition: "opacity 100ms",
    // Premium "glass" feel — rounded square with backdrop blur + glow.
    background: "rgba(20, 14, 8, 0.6)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    borderRadius: 24,
    boxShadow:
      "0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 40px rgba(232,197,107,0.15)",
    display: "grid",
    placeItems: "center",
    padding: 24,
    ...posStyles[logo.position],
  };
  return (
    <div style={baseStyle}>
      <Img src={logo.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
};

/** Realistic Claude chat mockup — picture-in-picture at top-center. */
const UIMockupOverlay: React.FC<{ mockup: UIMockup; t: number; fps: number }> = ({
  mockup,
  t,
  fps,
}) => {
  if (t < mockup.startSec - 0.3 || t > mockup.endSec + 0.3) return null;

  const alpha = interpolate(
    t,
    [mockup.startSec - 0.3, mockup.startSec, mockup.endSec, mockup.endSec + 0.3],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Spring-in entrance for the card itself.
  const localFrame = Math.max(0, Math.round((t - mockup.startSec) * fps));
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const scaleVal = 0.85 + enter * 0.15;
  const lift = (1 - enter) * 20; // 20px upward settle

  // Typing animation: reveal assistant reply char by char over 1s.
  const typedChars = Math.min(
    mockup.assistantReply.length,
    Math.max(0, Math.floor((t - mockup.startSec - 0.4) * mockup.assistantReply.length / 1.0)),
  );
  const visibleReply = mockup.assistantReply.slice(0, typedChars);

  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        left: 50,
        right: 50,
        opacity: alpha,
        transform: `translateY(${lift}px) scale(${scaleVal})`,
        transformOrigin: "top center",
      }}
    >
      <div
        style={{
          background: "rgba(20, 14, 8, 0.82)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 22,
          padding: 22,
          boxShadow:
            "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset",
          fontFamily: "'Inter', system-ui, sans-serif",
          color: "#F5EFE6",
        }}
      >
        {/* Header — Claude branding strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            fontSize: 14,
            color: "rgba(245,239,230,0.7)",
            letterSpacing: "0.04em",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              background: "#E8C56B",
            }}
          />
          Claude
        </div>

        {/* User bubble */}
        <div
          style={{
            background: "rgba(232,197,107,0.14)",
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 12,
            fontSize: 18,
            lineHeight: 1.35,
            color: "#F5EFE6",
            border: "1px solid rgba(232,197,107,0.25)",
          }}
        >
          {mockup.userMessage}
        </div>

        {/* Assistant bubble with typing cursor */}
        <div
          style={{
            background: "rgba(245,239,230,0.06)",
            borderRadius: 14,
            padding: "12px 16px",
            fontSize: 18,
            lineHeight: 1.4,
            color: "#F5EFE6",
            border: "1px solid rgba(245,239,230,0.08)",
            minHeight: 44,
          }}
        >
          {visibleReply}
          {typedChars < mockup.assistantReply.length && (
            <span
              style={{
                display: "inline-block",
                width: 9,
                height: 22,
                background: "#E8C56B",
                marginLeft: 2,
                verticalAlign: "text-bottom",
                opacity: Math.floor(t * 2.5) % 2 === 0 ? 1 : 0,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/** Full-frame hook card — opens the video with a punchy premium headline,
 *  doubles as a cover for early talking-head artifacts. Premium aesthetic:
 *  warm dark backdrop, big Fraunces italic emphasis word, slow scale-in,
 *  smooth fade-out into the talking head. */
const HookCardLayer: React.FC<{
  card: HookCard;
  t: number;
  fps: number;
}> = ({ card, t, fps }) => {
  if (t < card.startSec - 0.2 || t > card.endSec + 0.6) return null;

  // Fade in fast (0.2s), hold solid, fade out smoothly (0.5s) so the
  // talking head reveals as a graceful unmask, not a hard cut.
  const alpha = interpolate(
    t,
    [card.startSec - 0.2, card.startSec, card.endSec, card.endSec + 0.5],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Slight scale-in on the headline for cinematic motion.
  const localFrame = Math.max(0, Math.round((t - card.startSec) * fps));
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 80 },
  });
  const headlineScale = 0.92 + enter * 0.08;
  const lift = (1 - enter) * 30;

  // Subtitle starts revealing 0.4s after headline lands so the eye has
  // a chance to focus on the hook first.
  const subAlpha = interpolate(
    t,
    [card.startSec + 0.3, card.startSec + 0.7],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        opacity: alpha,
        // Warm dark gradient — the brand "luxury tech" palette
        background:
          "radial-gradient(ellipse at 50% 30%, #2A1A10 0%, #14100C 60%, #0A0807 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
      }}
    >
      {/* Subtle mustard accent strip at top */}
      <div
        style={{
          position: "absolute",
          top: 80,
          left: "50%",
          transform: "translateX(-50%)",
          width: 40,
          height: 3,
          borderRadius: 2,
          background: "#E8C56B",
          opacity: subAlpha * 0.8,
        }}
      />

      {/* Headline */}
      <div
        style={{
          transform: `translateY(${lift}px) scale(${headlineScale})`,
          textAlign: "center",
          maxWidth: 580,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 900,
            fontSize: 78,
            lineHeight: 1.04,
            color: "#F5EFE6",
            letterSpacing: "-0.02em",
            textShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          {card.headline}
        </h1>
      </div>

      {/* Subtitle */}
      {card.subtitle && (
        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            maxWidth: 560,
            opacity: subAlpha,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 24,
              lineHeight: 1.4,
              color: "rgba(245, 239, 230, 0.78)",
              letterSpacing: "0.01em",
            }}
          >
            {card.subtitle}
          </p>
        </div>
      )}
    </AbsoluteFill>
  );
};
