// Compliance / expiry engine — shared logic for the "licenses & expiries"
// feature. A document is the source of truth; its status is derived from how
// far away its expiry date is.

export type ComplianceStatus = "EXPIRED" | "EXPIRING_SOON" | "VALID";

/** Days within which an upcoming expiry is flagged as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

export function daysUntil(date: Date | string, now: Date = new Date()): number {
  const target = typeof date === "string" ? new Date(date) : date;
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  // Compare calendar days, ignoring time-of-day.
  const a = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / MS_PER_DAY);
}

export function complianceStatus(
  expiresOn: Date | string,
  now: Date = new Date()
): ComplianceStatus {
  const days = daysUntil(expiresOn, now);
  if (days < 0) return "EXPIRED";
  if (days <= EXPIRING_SOON_DAYS) return "EXPIRING_SOON";
  return "VALID";
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  DRIVER_LICENSE: "Driver License",
  VEHICLE_REGISTRATION: "Vehicle Registration",
  INSURANCE: "Insurance",
  INSPECTION: "Inspection",
  PERMIT: "Permit",
};

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}
