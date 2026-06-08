import { redirect } from "next/navigation";

// Published drafts now live on the unified /published page alongside
// daily-post publishes — one home for everything published. This route
// is kept only so old links/bookmarks redirect there instead of 404ing.
export default function PublishedDraftsRedirect() {
  redirect("/published");
}
