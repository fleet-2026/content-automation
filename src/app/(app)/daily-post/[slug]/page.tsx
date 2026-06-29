import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { getPost } from "../data";
import PostEditor from "./post-editor";

export const metadata: Metadata = {
  title: "Daily Post — Creator OS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
// Allow up to 150s for Server Action publishes — video Reels need time for
// IG container polling + multi-platform dispatch. Matches the other publish
// surfaces (compose/drafts/published/carousel); 60s was timing out → the
// action got killed mid-run and surfaced as "An unexpected response was
// received from the server."
export const maxDuration = 150;

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const post = await getPost(slug);
  // Intentionally do NOT auto-create a missing plan-day row here. Re-creating
  // on open resurrected days the user had deleted (opening a deleted day's URL
  // re-seeded it). Plan days are (re)built only via the "Set up the 30-day
  // plan" button — a missing/deleted day now 404s instead of coming back.
  if (!post) notFound();

  return (
    <div className="px-8 py-10 max-w-4xl">
      <Link
        href="/daily-post"
        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        ← All daily posts
      </Link>
      <h1 className="font-display text-3xl sm:text-4xl mt-2">
        {post.title}
      </h1>
      <p className="text-sm text-[var(--color-muted)] mt-1">
        Public guide:{" "}
        <a
          href={`/guides/${post.slug}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          /guides/{post.slug} ↗
        </a>
      </p>

      <PostEditor post={post} />
    </div>
  );
}
