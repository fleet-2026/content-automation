import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// Read via env() to strip BOM / wrapping quotes / hidden control chars.
// Same hardening we did for r2.ts and the OAuth env vars — when a value
// has a U+FEFF byte at position 0 (common from .env.local files saved as
// UTF-8-with-BOM), the Anthropic SDK's Authorization header gets an
// invalid character and Node rejects the outbound HTTPS request with
// "Invalid character in header content [\"authorization\"]". That looks
// to a debugging user like an Anthropic outage but is purely client-side.
const apiKey = env("ANTHROPIC_API_KEY");

export const anthropic = new Anthropic({
  apiKey: apiKey ?? "",
});

// Default models. Sonnet 4.6 is the workhorse; Opus 4.7 for the wild stuff.
export const MODELS = {
  fast: "claude-haiku-4-5-20251001",
  default: "claude-sonnet-4-6",
  smart: "claude-opus-4-7",
} as const;

export function assertAnthropicConfigured() {
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set (or only contains BOM/whitespace after sanitization). Check your Vercel env vars.",
    );
  }
}
