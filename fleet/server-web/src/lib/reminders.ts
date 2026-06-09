import { prisma } from "./prisma";
import { complianceStatus, documentTypeLabel } from "./compliance";
import { sendPush, type PushMessage } from "./push";

// Scans every compliance document and, for those expired or expiring soon,
// records a Reminder (deduped per document+milestone) and pushes a notification
// to fleet admins/dispatchers — plus the driver for a driver-license doc.
//
// Idempotent: the Reminder unique(documentId, kind) constraint means re-running
// won't double-send. A driver license that crosses SOON → EXPIRED gets one
// reminder per milestone.

export type ReminderResult = { scanned: number; created: number; pushed: number };

export async function runExpiryReminders(): Promise<ReminderResult> {
  const docs = await prisma.document.findMany({
    include: { vehicle: true, driver: { include: { user: true } }, reminders: true },
    orderBy: { expiresOn: "asc" },
  });

  // Fleet-side recipients (admins + dispatchers with a registered device).
  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "DISPATCHER"] }, pushToken: { not: null } },
    select: { pushToken: true },
  });
  const staffTokens = staff.map((s) => s.pushToken!).filter(Boolean);

  let created = 0;
  let pushed = 0;

  for (const doc of docs) {
    const status = complianceStatus(doc.expiresOn);
    if (status === "VALID") continue;
    const kind = status === "EXPIRED" ? "EXPIRED" : "SOON";

    // Already reminded for this milestone?
    if (doc.reminders.some((r) => r.kind === kind)) continue;

    await prisma.reminder.create({ data: { documentId: doc.id, kind, channel: "push" } });
    created++;

    const owner = doc.vehicle
      ? `${doc.vehicle.plateNumber} (${doc.vehicle.make} ${doc.vehicle.model})`
      : doc.driver?.name ?? "Unknown";
    const verb = kind === "EXPIRED" ? "has EXPIRED" : "expires within 30 days";
    const body = `${documentTypeLabel(doc.type)} for ${owner} ${verb} (${new Date(
      doc.expiresOn
    ).toLocaleDateString()}).`;

    const tokens = [...staffTokens];
    if (doc.type === "DRIVER_LICENSE" && doc.driver?.user?.pushToken) {
      tokens.push(doc.driver.user.pushToken);
    }
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      title: kind === "EXPIRED" ? "Document expired" : "Document expiring soon",
      body,
      data: { documentId: doc.id, kind },
    }));
    if (messages.length) {
      await sendPush(messages);
      pushed += messages.length;
    }
    // Always leave a server-side trail even when no device is registered.
    console.log(`[reminder] ${kind}: ${body}`);
  }

  return { scanned: docs.length, created, pushed };
}
