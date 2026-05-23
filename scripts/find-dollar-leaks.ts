import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");
  const drafts = await prisma.draft.findMany({ where: { userId: user.id }, orderBy: { scheduledFor: "asc" } });
  for (const d of drafts) {
    const stamp = d.scheduledFor.toISOString().slice(5, 16);
    const captionMatches = [...d.caption.matchAll(/\$\d[\d,.]*\w*/g)].map(m => m[0]);
    const hookMatches = d.selectedHook ? [...d.selectedHook.matchAll(/\$\d[\d,.]*\w*/g)].map(m => m[0]) : [];
    const hookOptsJson = JSON.stringify(d.hookOptions ?? []);
    const altMatches = [...hookOptsJson.matchAll(/\$\d[\d,.]*\w*/g)].map(m => m[0]);
    if (captionMatches.length || hookMatches.length || altMatches.length) {
      console.log(`${stamp}`);
      if (captionMatches.length) console.log(`  caption: ${captionMatches.join(", ")}`);
      if (hookMatches.length) console.log(`  hook:    ${hookMatches.join(", ")}`);
      if (altMatches.length) console.log(`  alts:    ${altMatches.join(", ")}`);
    }
  }
}
main().finally(() => prisma.$disconnect());
