/**
 * Quick utility: list your HeyGen avatars + custom/cloned voices so you
 * can identify which avatar_id and voice_id to use for bulk video gen.
 *
 * Usage:
 *   npx tsx scripts/list-heygen-resources.ts
 *
 * Output: avatars (all), then English voices grouped into "custom"
 * (likely your clones) and "stock" so the custom ones are easy to spot.
 */

import dotenv from "dotenv";
// HEYGEN_API_KEY lives in .env.local; load that with override so it wins
// over the empty/missing version in .env.
dotenv.config({ path: ".env", override: true });
dotenv.config({ path: ".env.local", override: true });

import { listAvatars, listVoices } from "../src/lib/ai/heygen";

async function main() {
  const [avatars, voices] = await Promise.all([listAvatars(), listVoices()]);

  console.log(`\n=== AVATARS (${avatars.length}) ===\n`);
  for (const a of avatars) {
    console.log(`  ${a.avatar_id}`);
    console.log(`    ${a.avatar_name}${a.gender ? ` · ${a.gender}` : ""}`);
    if (a.preview_image_url) console.log(`    preview: ${a.preview_image_url}`);
    console.log("");
  }

  const en = voices.filter((v) => v.language.toLowerCase().startsWith("en"));
  // HeyGen marks user-cloned voices with names that don't match their
  // stock voice list. The cleanest heuristic: stock voices have language
  // codes like "en-US" / "en-GB" — custom voices usually just "en".
  // Tweak as needed once you spot your own clones.
  const isCustom = (name: string) =>
    /custom|clone|fadia|my/i.test(name) || name.length < 6;
  const customs = en.filter((v) => isCustom(v.name));
  const stock = en.filter((v) => !isCustom(v.name));

  if (customs.length > 0) {
    console.log(`\n=== CUSTOM / CLONED VOICES (${customs.length}) ===\n`);
    for (const v of customs) {
      console.log(`  ${v.voice_id}  ${v.name} · ${v.gender} · ${v.language}`);
    }
  }

  console.log(`\n=== STOCK ENGLISH VOICES (${stock.length}) — first 30 ===\n`);
  for (const v of stock.slice(0, 30)) {
    console.log(`  ${v.voice_id}  ${v.name} · ${v.gender} · ${v.language}`);
  }

  console.log("\n=== NEXT STEP ===\n");
  console.log("Add these two lines to your .env.local (no quotes):");
  console.log("  HEYGEN_DEFAULT_AVATAR_ID=<paste avatar_id from above>");
  console.log("  HEYGEN_DEFAULT_VOICE_ID=<paste voice_id from above>");
  console.log("\nThen run:");
  console.log("  npx tsx scripts/generate-heygen-videos.ts");
  console.log("\nThe bulk script processes guides in index order starting from #1,");
  console.log("skips guides that already have a video, and STOPS on credit errors");
  console.log("so you never burn through what you can't afford.\n");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
