import { NextResponse } from "next/server";
import { runExpiryReminders } from "@/lib/reminders";

// Scheduled endpoint. Protect with a shared secret so only your scheduler can
// trigger it (Vercel Cron, GitHub Action, etc.):
//   curl -H "x-cron-secret: $CRON_SECRET" https://host/api/cron/expiry-reminders
// Middleware lets /api/cron through; the secret check happens here.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runExpiryReminders();
  return NextResponse.json({ ok: true, ...result });
}
