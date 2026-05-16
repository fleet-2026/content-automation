/**
 * Run: npm run seed:user
 * Creates the single admin user. Reads ADMIN_EMAIL from env, prompts for password.
 */
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import readline from "node:readline";

const prisma = new PrismaClient();

function ask(q: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    process.stdout.write(q);
    process.stdin.resume();
    process.stdin.setRawMode?.(true);
    return new Promise((resolve) => {
      let buf = "";
      const onData = (chunk: Buffer) => {
        const ch = chunk.toString("utf8");
        if (ch === "\n" || ch === "\r" || ch === "") {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(buf);
        } else if (ch === "") {
          process.exit(1);
        } else if (ch === "\b" || ch === "\x7f") {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
          process.stdout.write("*");
        }
      };
      process.stdin.on("data", onData);
    });
  }
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) {
    console.error("✗ ADMIN_EMAIL must be set in .env.local first.");
    process.exit(1);
  }

  console.log(`Creating user for: ${adminEmail}`);
  const name = (await ask("Name (optional): ")).trim() || null;
  const niche = (await ask("Niche (e.g. fitness, dev, finance): ")).trim() || null;
  const pw1 = await ask("Password: ", true);
  const pw2 = await ask("Confirm password: ", true);

  if (pw1 !== pw2) {
    console.error("✗ Passwords do not match.");
    process.exit(1);
  }
  if (pw1.length < 12) {
    console.error("✗ Use at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await hash(pw1, 12);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, passwordHash, name, niche },
    update: { passwordHash, name, niche },
  });

  console.log(`✓ User ready: ${user.email} (id ${user.id})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
