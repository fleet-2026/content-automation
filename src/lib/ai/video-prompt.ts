/**
 * Video-prompt generator for daily guides.
 *
 * Takes a guide's source content (title, hook, script, caption, optional
 * body) and produces a structured SCENES + VOICEOVER + CAPTIONS brief
 * that can be pasted into Sora / Veo / Runway / Pika to generate the
 * 12-second vertical Reel for the guide.
 *
 * The brand voice is "warm, intimate, editorial" — see the SYSTEM_PROMPT
 * below for the exact format rules. The format mirrors the reference
 * brief the user provided (4 scenes × 3 seconds, 9:16, slow-motion 60fps,
 * specific lens + lighting language, voiceover with ellipsis pauses,
 * per-scene caption with font hint).
 */

import Anthropic from "@anthropic-ai/sdk";

export type VideoPromptInput = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  body?: string;
};

const MODEL = process.env.VIDEO_PROMPT_MODEL ?? "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a senior commercial director writing AI-video production briefs.
Given a piece of social-media content (title, hook, talking-head script, caption,
optional long-form body), produce a 12-second vertical 9:16 Reel brief in the EXACT
format below. The brief is pasted directly into Sora / Veo / Runway / Pika, so it
must be detailed enough for those models to render every scene faithfully.

Format (strict — match heading casing and structure):

SCENES

Scene 1: 0:00–0:03
[180-220 word paragraph. Describe a single woman in her late 20s to early 30s
(natural makeup, dark hair pulled loosely back) as the recurring subject across
all four scenes. Specify: environment / props, exact action, lighting (use
specific language — warm amber, rim light, bokeh, dust motes, golden blur),
camera move (push-in / tilt / locked-off / dolly), lens feel (e.g. 85mm prime,
100mm macro), and how this scene transitions into the next (slow dissolve,
hard cut, fade). Slow motion 60fps is the default unless the beat calls for
real-time. Vertical 9:16 always.]

Scene 2: 0:03–0:06
[Same depth and structure. Mid-story beat — the tension or detail.]

Scene 3: 0:06–0:09
[Same depth and structure. Resolution beat — the shift, the insight, the action.]

Scene 4: 0:09–0:12
[Same depth and structure. The closing image — usually an extreme close-up
on hands writing / typing / a screen / a face that lands the message. End
with "slow fade to black" or a similarly definitive close.]

VOICEOVER

Tone: [one short clause describing voice quality — e.g. "warm, intimate,
measured — like a trusted friend speaking honestly over coffee"]
Pace: [one clause specifying pace — slow ~120 wpm with deliberate pauses]

"[Voiceover script under 45 words total. Pull the strongest 4-7 sentences
from the hook + script. Break with ' ... ' between sentences to mark
half-beat pauses. The script should be readable in exactly 12 seconds at
the specified pace.]"

Breathing room: [one line describing how silence should feel — e.g.
"full half-beat pause after every sentence; silence should feel
intentional, not empty"]

CAPTIONS

Scene 1 caption: Exact text — "[short pull-quote from the script, 4-8 words]".
Font feel: [editorial serif suggestion, e.g. "clean modern serif, Freight Display
or Domaine Display"]
Scene 2 caption: Exact text — "[…]". Font feel: [same family, may differ in weight]
Scene 3 caption: Exact text — "[…]". Font feel: [same family]
Scene 4 caption: Exact text — "[…]". Font feel: [same family]

Hard rules:
- The female subject is consistent across all 4 scenes — same person, same outfit
  family (cozy editorial: soft sweater, neutral tones), same setting evolves
  rather than jump-cuts to unrelated environments.
- Each scene 3 seconds, slow-motion 60fps default, vertical 9:16 always.
- Use specific lens references — never just "camera shot of".
- Use specific lighting language — warm amber, golden hour, rim light, key light
  from the left, bokeh, dust motes, screen glow. Avoid generic "natural lighting."
- Voiceover script must be exactly the warmth of the source hook + script — do
  not invent claims the source doesn't make. Stay editorial, not salesy.
- Captions must be EXACT pull-quotes from the voiceover script (or short
  paraphrases of source lines).
- Output ONLY the brief. No preamble, no commentary, no markdown bold/italic.`;

function buildUserPrompt(input: VideoPromptInput): string {
  const parts = [
    `TITLE: ${input.title}`,
    "",
    `HOOK (on-camera opener):`,
    input.hook,
    "",
    `TALKING-HEAD SCRIPT (the full spoken script for the Reel):`,
    input.script,
    "",
    `CAPTION (the post text, often more polished than the script):`,
    input.caption,
  ];
  if (input.body && input.body.trim().length > 0) {
    parts.push("", `LONG-FORM ARTICLE BODY (context for the brief):`, input.body);
  }
  parts.push("", "Write the 4-scene production brief now.");
  return parts.join("\n");
}

/** Calls Claude to generate the video-prompt brief. Throws on auth /
 *  network / API errors so callers can surface them. */
export async function generateVideoPromptText(
  input: VideoPromptInput,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.startsWith("sk-ant")) {
    throw new Error(
      "ANTHROPIC_API_KEY missing or malformed (server env). Cannot generate.",
    );
  }
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 3500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });
  const first = msg.content[0];
  if (!first || first.type !== "text") {
    throw new Error("Anthropic returned no text content");
  }
  const text = first.text.trim();
  if (text.length < 400) {
    throw new Error(`Generated brief suspiciously short (${text.length} chars)`);
  }
  return text;
}
