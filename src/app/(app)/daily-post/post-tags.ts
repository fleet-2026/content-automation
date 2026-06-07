/**
 * Best-effort categorization for daily-post guides. The DailyGuide table
 * has no aiTool/topic columns, so the /daily-post filter bar derives both
 * from each post's text (title + hook + caption + keyword + hashtags).
 *
 * Pure functions — safe to import from the client filter component.
 */
import type { DailyPost } from "./data";

export const AI_TOOLS = [
  "Claude",
  "ChatGPT",
  "Gemini",
  "Canva",
  "Perplexity",
  "Notion",
] as const;
export type AiTool = (typeof AI_TOOLS)[number];

export const TOPICS = [
  "News",
  "Setup",
  "Prompts",
  "Skills",
  "AI Agents",
  "Workflows",
  "Creative",
  "Side Hustles",
  "Entrepreneurs",
  "Career",
] as const;
export type Topic = (typeof TOPICS)[number];

const TOOL_PATTERNS: Record<AiTool, RegExp> = {
  Claude: /\bclaude\b/i,
  ChatGPT: /\b(chat\s?gpt|gpt-?[45]|openai)\b/i,
  Gemini: /\bgemini\b/i,
  Canva: /\bcanva\b/i,
  Perplexity: /\bperplexity\b/i,
  Notion: /\bnotion\b/i,
};

const TOPIC_PATTERNS: Record<Topic, RegExp> = {
  News: /\b(news|launch(?:ed|es|ing)?|announc|releas|breaking|just dropped|new feature|update)\b/i,
  Setup: /\b(set\s?up|install|configure|connect|integration|getting started|onboard|step[- ]by[- ]step)\b/i,
  Prompts: /\b(prompt|prompts|prompting|system prompt|prompt pack)\b/i,
  Skills: /\b(skill|skills|how to|tutorial|master|learn|beginner|guide)\b/i,
  "AI Agents": /\b(agent|agents|agentic|mcp|mcps|autonomous|bot)\b/i,
  Workflows: /\b(workflow|workflows|pipeline|automat(?:e|ion|ing)|n8n|zapier|make\.com|process)\b/i,
  Creative: /\b(image|images|video|design|art|creative|logo|thumbnail|midjourney|carousel|reel)\b/i,
  "Side Hustles": /\b(side hustle|side income|make money|passive income|monetize|earn|\$\d)\b/i,
  Entrepreneurs: /\b(business|entrepreneur|startup|founder|client|agency|saas|revenue|sales)\b/i,
  Career: /\b(career|job|jobs|resume|cv|interview|linkedin|hire|hiring|promotion|salary)\b/i,
};

function postText(p: DailyPost): string {
  const g = p.generated;
  return [p.title, g?.hook, g?.caption, g?.keyword, ...(g?.hashtags ?? [])]
    .filter(Boolean)
    .join(" ");
}

/** Tools mentioned in a post. May be empty (no recognised tool). */
export function detectTools(p: DailyPost): AiTool[] {
  const text = postText(p);
  return AI_TOOLS.filter((t) => TOOL_PATTERNS[t].test(text));
}

/** Topics a post matches. May be empty. */
export function detectTopics(p: DailyPost): Topic[] {
  const text = postText(p);
  return TOPICS.filter((t) => TOPIC_PATTERNS[t].test(text));
}

/** Whether a post matches the active AI-tool pill. "Multi-Tool" = 2+ tools. */
export function matchesTool(p: DailyPost, tool: AiTool | "Multi-Tool"): boolean {
  const tools = detectTools(p);
  if (tool === "Multi-Tool") return tools.length >= 2;
  return tools.includes(tool);
}

/** Lowercased searchable blob for the search box. */
export function searchBlob(p: DailyPost): string {
  return postText(p).toLowerCase();
}
