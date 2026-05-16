import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

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
    throw new Error("ANTHROPIC_API_KEY is not set in .env.local");
  }
}
