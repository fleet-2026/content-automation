import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { tryGetUser } from "@/lib/auth-helpers";
import { CarouselEditor } from "./carousel-editor";

export const metadata: Metadata = {
  title: "Carousel — Creator OS",
  description: "Create and publish carousel posts.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CarouselPage() {
  const userId = await tryGetUser();
  if (!userId) redirect("/login");

  return (
    <div className="px-8 py-10 max-w-4xl">
      <h1 className="font-display text-3xl sm:text-4xl mb-6">
        Carousel <span className="font-italic-accent text-blush">post.</span>
      </h1>
      <CarouselEditor />
    </div>
  );
}
