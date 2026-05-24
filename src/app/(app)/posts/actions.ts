"use server";

import { revalidatePath } from "next/cache";
import { Platform } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";
import { decrypt } from "@/lib/crypto";

/**
 * Delete a published post via the platform's API and remove the Post row
 * locally. Currently supports Facebook (Graph API). TikTok/IG/YouTube
 * delete is platform-specific work — added on-demand.
 *
 * Auth: requires session ownership of the Post.
 * Behavior: best-effort delete on the platform side; the local DB row
 * is removed regardless so the dashboard doesn't keep showing a post
 * the user thinks is gone.
 */
export async function deletePost(
  postId: string,
): Promise<{ ok: boolean; error?: string }> {
  let userId: string;
  try {
    userId = await requireUser();
  } catch {
    return { ok: false, error: "unauthenticated" };
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, userId },
  });
  if (!post) return { ok: false, error: "post_not_found" };

  // Post -> SocialAccount is a foreign-key reference, not a Prisma
  // relation field. Look up the account separately so we can decrypt
  // the access token.
  const account = await prisma.socialAccount.findUnique({
    where: { id: post.socialAccountId },
  });

  let platformDeleteErr: string | undefined;

  if (post.platform === Platform.FACEBOOK) {
    if (!account) {
      platformDeleteErr = "Connected Facebook account not found locally.";
    } else {
      try {
        const token = decrypt(account.accessToken);
      // Facebook Graph API delete: DELETE /{post-id}
      // The post-id is "{pageId}_{postId}" format — our platformPostId
      // already stores it that way from the publish step.
        const r = await fetch(
          `https://graph.facebook.com/v21.0/${post.platformPostId}?access_token=${encodeURIComponent(token)}`,
          { method: "DELETE" },
        );
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          platformDeleteErr = `FB delete ${r.status}: ${text.slice(0, 200)}`;
        }
      } catch (e) {
        platformDeleteErr = (e as Error).message;
      }
    }
  } else if (post.platform === Platform.INSTAGRAM) {
    // IG Graph API doesn't expose programmatic delete for organic posts
    // via the Business API. The user needs to delete from the IG app
    // itself. We still remove the local row but surface the limitation.
    platformDeleteErr =
      "Instagram doesn't expose post deletion via API — delete from the IG app itself; the dashboard row is removed.";
  } else if (post.platform === Platform.TIKTOK || post.platform === Platform.YOUTUBE) {
    // Neither has a clean delete-by-id endpoint in the scopes we hold.
    platformDeleteErr = `${post.platform} delete not supported — remove from the ${post.platform.toLowerCase()} app directly. Local row cleared.`;
  }

  // Always remove the local Post row so the dashboard reflects the user's
  // intent. If the platform-side delete failed, surface the message so
  // they know to finish the job in the app.
  await prisma.post.delete({ where: { id: post.id } });
  revalidatePath("/posts");

  if (platformDeleteErr) {
    return { ok: true, error: platformDeleteErr };
  }
  return { ok: true };
}
