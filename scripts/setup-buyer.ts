/**
 * Creator OS — Buyer Setup Script
 *
 * Run after setting DATABASE_URL and ADMIN_EMAIL in your .env:
 *   npm run setup
 *
 * What it does:
 *  1. Creates all database tables (prisma db push)
 *  2. Creates your admin user (no password needed — AUTH_DEV_OPEN=1 bypasses login)
 *  3. Verifies the setup is working
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

async function main() {
  console.log("\n🚀 Creator OS — Setup\n");

  // 1. Run DB migrations
  console.log("1/3 Setting up database...");
  try {
    execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
    console.log("   ✓ Database tables created\n");
  } catch {
    console.error("   ✗ Database setup failed. Check DATABASE_URL in your .env file\n");
    process.exit(1);
  }

  // 2. Create admin user
  console.log("2/3 Creating admin user...");
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email) {
    console.error("   ✗ ADMIN_EMAIL not set in .env\n");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`   ✓ Admin user already exists: ${email}\n`);
  } else {
    const placeholder = randomBytes(32).toString("hex");
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hash(placeholder, 8),
        name: email.split("@")[0],
      },
    });
    console.log(`   ✓ Admin user created: ${email}\n`);
  }

  // 3. Verify
  console.log("3/3 Verifying setup...");
  const userCount = await prisma.user.count();
  const guideCount = await prisma.dailyGuide.count();
  console.log(`   ✓ Users: ${userCount}`);
  console.log(`   ✓ Guides: ${guideCount}`);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(`\n✅ Setup complete!\n`);
  console.log(`   Open: ${appUrl}/dashboard`);
  console.log(`   Login: bypassed (AUTH_DEV_OPEN=1 — single user mode)`);
  console.log(`\n   Next steps:`);
  console.log(`   • Connect Instagram: ${appUrl}/dashboard (click Connect)`);
  console.log(`   • Create your first post: ${appUrl}/daily-post`);
  console.log(`   • Set up Instagram bot: see BUYER-SETUP.md Step 5\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
