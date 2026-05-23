/** List drafts with <4 paragraph beats so I know which to expand. */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");
  const all = await prisma.draft.findMany({
    where: { userId: user.id },
    orderBy: { scheduledFor: "asc" },
  });
  console.log(`Auditing ${all.length} drafts for paragraph counts:\n`);
  for (const d of all) {
    const paragraphs = d.caption.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const ts = d.scheduledFor.toISOString().slice(5, 16).replace("T", " ");
    const hook = (d.selectedHook ?? d.caption.split("\n")[0]).slice(0, 50);
    const flag = paragraphs.length < 4 ? "⚠ SHORT" : "  ok   ";
    console.log(`${flag}  ${ts}  ${paragraphs.length}p  "${hook}"`);
  }
}
main().finally(() => prisma.$disconnect());
