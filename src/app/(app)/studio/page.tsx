import { StudioUI } from "./studio-ui";

export const dynamic = "force-dynamic";

export default function StudioPage() {
  return (
    <div className="px-8 py-10 max-w-6xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        Make <span className="font-italic-accent text-blush">something.</span>
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Generate images and videos for your posts. Powered by OpenAI gpt-image-1
        + Sora 2. Saved to R2, ready to drop into a draft.
      </p>
      <StudioUI />
    </div>
  );
}
