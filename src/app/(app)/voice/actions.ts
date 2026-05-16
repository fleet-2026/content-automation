"use server";

import { requireUser } from "@/lib/auth-helpers";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  addVoiceSample,
  listVoiceSamples,
  deleteVoiceSample,
} from "@/lib/brand-voice";
import { generateVoiceDrafts, type CaptionDraft } from "@/lib/ai/voice-drafter";
import { transcribeUrl } from "@/lib/ai/transcribe";

export async function addSample(text: string) {
  const userId = await requireUser();
  return addVoiceSample(userId, text);
}

export async function listSamples() {
  const userId = await requireUser();
  return listVoiceSamples(userId);
}

export async function removeSample(id: string) {
  const userId = await requireUser();
  return deleteVoiceSample(userId, id);
}

export async function draftFromThought(thought: string): Promise<{
  drafts: CaptionDraft[];
  samplesUsed: { id: string; text: string }[];
}> {
  const userId = await requireUser();
  await enforceRateLimit(`voicedraft:${userId}`, { ...RATE_LIMITS.HOOK_GEN, label: "voice drafts" });
  const out = await generateVoiceDrafts({ userId, thought });
  return {
    drafts: out.drafts,
    samplesUsed: out.samplesUsed.map((s) => ({ id: s.id, text: s.text })),
  };
}

export async function transcribeAndDraft(audioUrl: string) {
  const userId = await requireUser();
  await enforceRateLimit(`transcribe:${userId}`, { ...RATE_LIMITS.TRANSCRIBE, label: "transcription" });
  const t = await transcribeUrl(audioUrl);
  if (!t.text?.trim()) throw new Error("Transcription returned empty text");
  const out = await generateVoiceDrafts({ userId, thought: t.text });
  return {
    transcript: t.text,
    drafts: out.drafts,
    samplesUsed: out.samplesUsed.map((s) => ({ id: s.id, text: s.text })),
  };
}
