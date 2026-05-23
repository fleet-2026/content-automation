import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const accounts = await prisma.socialAccount.findMany({
  select: { id: true, platform: true, username: true, displayName: true, platformUserId: true,
           isActive: true, tokenExpiry: true, lastSyncedAt: true, lastError: true, scopes: true,
           createdAt: true, metadata: true },
  orderBy: { platform: "asc" },
});
const now = new Date();
for (const a of accounts) {
  const expired = a.tokenExpiry && a.tokenExpiry < now;
  const daysToExpiry = a.tokenExpiry ? Math.round((a.tokenExpiry.getTime() - now.getTime()) / 86400000) : null;
  console.log(`\n[${a.platform}] ${a.username ?? a.displayName ?? "(no name)"}`);
  console.log(`  platformUserId: ${a.platformUserId}`);
  console.log(`  isActive: ${a.isActive}`);
  console.log(`  tokenExpiry: ${a.tokenExpiry ? a.tokenExpiry.toISOString() + ` (${expired ? "EXPIRED" : daysToExpiry + "d left"})` : "no expiry / long-lived"}`);
  console.log(`  scopes: ${a.scopes ?? "(none stored)"}`);
  console.log(`  lastSyncedAt: ${a.lastSyncedAt?.toISOString() ?? "never"}`);
  console.log(`  lastError: ${a.lastError ?? "(none)"}`);
  console.log(`  metadata keys: ${a.metadata ? Object.keys(a.metadata).join(",") : "(none)"}`);
}
await prisma.$disconnect();
