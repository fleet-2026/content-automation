import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });

import { PrismaClient } from "@prisma/client";
import { generateVideoPromptText } from "../src/lib/ai/video-prompt";

async function main() {
  const p = new PrismaClient();
  const slug = process.argv[2] ?? "claude-prompts-that-improve-themselves";
  const g = await p.dailyGuide.findUnique({
    where: { slug },
    select: { title: true, hook: true, script: true, caption: true, body: true },
  });
  if (!g) {
    console.error("Guide not found:", slug);
    process.exit(1);
  }
  console.log(`Generating brief for: ${slug}\nTitle: ${g.title}\n`);
  const t0 = Date.now();
  const text = await generateVideoPromptText({
    title: g.title,
    hook: g.hook,
    script: g.script,
    caption: g.caption,
    body: g.body,
  });
  console.log("--- BRIEF ---\n");
  console.log(text);
  console.log("\n--- END ---");
  console.log(
    `\nLength: ${text.length} chars, ${text.split(/\s+/).filter(Boolean).length} words, ${Date.now() - t0}ms`,
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
