import { NotesUI } from "./notes-ui";
import { getNotes } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const initialNotes = await getNotes();
  return (
    <div className="px-8 py-10 max-w-6xl">
      <h1 className="font-display text-3xl sm:text-4xl">
        Your <span className="font-italic-accent text-blush">notes.</span>
      </h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Stash course links, swipe ideas, and reference material. Links are
        auto-clickable. Pin the ones you reach for most.
      </p>
      <NotesUI initial={initialNotes} />
    </div>
  );
}
