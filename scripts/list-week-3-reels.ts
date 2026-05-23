/**
 * Print every Week-3 Reel's exact location:
 *   - Source video file on your machine
 *   - R2-hosted URL (the actual mediaUrl attached to the draft)
 *   - Creator OS draft page link
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");

  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-06-08T00:00:00Z");
  const reels = await prisma.draft.findMany({
    where: { userId: user.id, scheduledFor: { gte: start, lt: end } },
    orderBy: { scheduledFor: "asc" },
  });

  console.log(`\n${reels.length} Week-3 Reels:\n`);
  for (const r of reels) {
    const when = r.scheduledFor.toISOString().slice(0, 16).replace("T", " ");
    console.log(`📅 ${when} UTC`);
    console.log(`   Hook:       ${r.selectedHook}`);
    console.log(`   In app:     https://creator-os-delta.vercel.app/compose?draft=${r.id}`);
    console.log(`   Video URL:  ${r.mediaUrl}`);
    console.log("");
  }
}
main().finally(() => prisma.$disconnect());
