import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  select: { id: true, email: true, name: true, createdAt: true },
  orderBy: { createdAt: "asc" },
});
const accounts = await prisma.socialAccount.findMany({
  select: { userId: true, platform: true, username: true, isActive: true },
});
console.log("Users:", users.length);
for (const u of users) {
  const userAccts = accounts.filter(a => a.userId === u.id);
  console.log(`  ${u.email ?? "(no email)"} | id=${u.id.slice(0,12)}... | ${userAccts.length} accts: ${userAccts.map(a => a.platform + (a.isActive?"":"(inactive)")).join(",") || "none"}`);
}
await prisma.$disconnect();
