/**
 * One-time DB cleanup: strip disabled platforms (e.g. YouTube) from
 * every Draft's platforms[] array AND from each Draft's publishResults
 * JSON blob.
 *
 * Why: after disabling YouTube in PLATFORM_INFO, the UI hides it from
 * NEW drafts but existing drafts saved with YOUTUBE in their arrays
 * keep showing the reconnect/expired messages. Client-side filtering
 * masks them in the UI; this script removes them at the source so
 * even non-filtered consumers (analytics, exports) stop counting them.
 *
 *   npx tsx scripts/strip-disabled-platforms.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });

import { PrismaClient, Platform } from "@prisma/client";
import { PLATFORM_INFO } from "../src/lib/platform-info";

async function main() {
  const prisma = new PrismaClient();
  try {
    const disabled = (Object.keys(PLATFORM_INFO) as Platform[]).filter(
      (p) => PLATFORM_INFO[p].enabled === false,
    );
    if (disabled.length === 0) {
      console.log("No disabled platforms — nothing to strip.");
      return;
    }
    console.log("Stripping these disabled platforms from drafts:", disabled);

    const drafts = await prisma.draft.findMany({
      select: { id: true, platforms: true, publishResults: true },
    });
    console.log(`Scanning ${drafts.length} drafts…`);

    let updated = 0;
    for (const d of drafts) {
      const newPlatforms = d.platforms.filter((p) => !disabled.includes(p));
      const oldResults = (d.publishResults as unknown as { platform: Platform }[] | null) ?? null;
      const newResults =
        Array.isArray(oldResults)
          ? oldResults.filter((r) => !disabled.includes(r.platform))
          : oldResults;

      const platformsChanged = newPlatforms.length !== d.platforms.length;
      const resultsChanged =
        Array.isArray(oldResults) &&
        Array.isArray(newResults) &&
        newResults.length !== oldResults.length;

      if (!platformsChanged && !resultsChanged) continue;

      await prisma.draft.update({
        where: { id: d.id },
        data: {
          platforms: newPlatforms,
          publishResults: newResults as unknown as object | null,
        },
      });
      updated++;
    }
    console.log(`Done. Updated ${updated}/${drafts.length} drafts.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
