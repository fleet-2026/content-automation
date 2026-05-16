import { BrowseUI } from "./browse-ui";

export const dynamic = "force-dynamic";

export default function BrowsePage() {
  return (
    <div className="px-8 py-10 max-w-6xl">
      <h1 className="text-3xl font-semibold tracking-tight">Browse</h1>
      <p className="text-[var(--color-muted)] mt-1 mb-8">
        Peek at any Instagram account without committing to your watchlist.
        Search a handle, scan their latest posts, click through to Instagram
        when you want the full feed.
      </p>
      <BrowseUI />
    </div>
  );
}
