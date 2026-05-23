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

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  const post = await getPost(slug);
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
        Source:{" "}
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {post.url}
        </a>
      </p>

      <PostEditor post={post} />
    </div>
  );
}
