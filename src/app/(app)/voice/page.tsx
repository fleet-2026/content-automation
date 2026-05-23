import { VoiceUI } from "./voice-ui";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  return (
    <div className="px-8 py-10 max-w-6xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        Brand <span className="font-italic-accent text-blush">voice.</span>
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Brand voice memory + 3-draft caption generator. Dump a thought, get
        polished IG-ready drafts in your voice.
      </p>
      <VoiceUI />
    </div>
  );
}
