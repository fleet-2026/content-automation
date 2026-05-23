/**
 * Swap "401k vs. no 401k" → "people who understood compound interest vs. people who didn't"
 * on the Thu 5/28 12:30pm AI-literacy draft. One-line surgical edit.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TARGET = new Date("2026-05-28T16:30:00.000Z");
const NEW_CAPTION = `AI literacy is the new financial literacy.

A new line is being drawn. Most people don't see it yet.

Pre-2020, financial literacy split outcomes: people who understood compound interest vs. people who didn't. Compounded over decades.

Post-2024, AI literacy splits outcomes again: leverage vs. replaceable. Compounding by the quarter.

Working women are the most exposed AND the most under-trained. Both at the same time.

Start tonight → https://earnwith-ai.com/100-days`;

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim()!;
  const user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) throw new Error("no user");
  const d = await prisma.draft.findFirst({
    where: { userId: user.id, scheduledFor: TARGET },
  });
  if (!d) { console.log("Draft not found"); return; }
  await prisma.draft.update({
    where: { id: d.id },
    data: { caption: NEW_CAPTION },
  });
  console.log("✓ Swapped '401k' reference for 'compound interest' on Thu 5/28 12:30pm");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
