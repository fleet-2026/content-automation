/**
 * Diagnostic: dump the 3 most recent drafts with their packed mediaUrl
 * and publishResults so we can see why a multi-image post only sent 1
 * image to Instagram.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });

import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const drafts = await p.draft.findMany({
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        caption: true,
        mediaUrl: true,
        status: true,
        platforms: true,
        publishResults: true,
        updatedAt: true,
      },
    });
    for (const d of drafts) {
      console.log("─".repeat(70));
      console.log("id:", d.id);
      console.log("updated:", d.updatedAt.toISOString());
      console.log("status:", d.status);
      console.log("platforms:", d.platforms);
      console.log("caption (first 80):", d.caption.slice(0, 80));
      const urls = (d.mediaUrl ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      console.log("mediaUrl lines:", urls.length);
      urls.forEach((u, i) => console.log(`  [${i}] ${u.slice(0, 110)}`));
      console.log(
        "publishResults:",
        JSON.stringify(d.publishResults, null, 2)?.slice(0, 1500),
      );
    }
  } finally {
    await p.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
