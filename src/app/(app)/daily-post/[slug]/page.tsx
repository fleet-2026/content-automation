import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { tryGetUser } from "@/lib/auth-helpers";
import { getPost } from "../data";
import { ensurePlanGuide } from "../../30-days/seed";
import PostEditor from "./post-editor";

export const metadata: Metadata = {
  title: "Daily Post — Creator OS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
// Allow up to 60s for Server Action uploads (video files need time)
export const maxDuration = 60;

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  let post = await getPost(slug);
  // 30-day plan days are created on demand: if the slug is a known plan day
  // that hasn't been seeded yet, create its row now so the editor opens
  // straight from a /30-days card without a separate setup step.
  if (!post) {
    const seeded = await ensurePlanGuide(slug);
    if (seeded) post = await getPost(slug);
  }
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
