// Tracker metadata helpers.
//
// To avoid touching the Prisma schema (no migration risk on prod), we stash
// the per-day tracker fields inside the existing Draft.hookOptions JSON
// column under a reserved key "trackerMeta". The compose page won't read or
// write this key — it's namespaced so they coexist cleanly.
//
// Shape:
//   hookOptions = {
//     // existing hook variants live here as before, e.g.:
//     // variants: [...], or { text, pattern, ... }
//     trackerMeta?: TrackerMeta
//   }
//
// If hookOptions was previously stored as a bare array of variants (old
// shape), readTrackerMeta returns null and writeTrackerMeta promotes it to
// the new object shape, preserving the variants under "variants".

import type { Prisma } from "@prisma/client";

export type TrackerMeta = {
  dayNumber?: number;
  keyword?: string;
  guideLink?: string;
  manychatDmText?: string;
  manychatWired?: boolean;
  igPostUrl?: string;
};

type HookOptionsObject = Record<string, unknown> & {
  trackerMeta?: TrackerMeta;
  variants?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function readTrackerMeta(
  hookOptions: Prisma.JsonValue | null | undefined,
): TrackerMeta | null {
  if (!hookOptions) return null;
  if (Array.isArray(hookOptions)) return null;
  if (!isObject(hookOptions)) return null;
  const meta = hookOptions.trackerMeta;
  if (!meta || typeof meta !== "object") return null;
  return meta as TrackerMeta;
}

export function writeTrackerMeta(
  hookOptions: Prisma.JsonValue | null | undefined,
  patch: Partial<TrackerMeta>,
): Prisma.InputJsonValue {
  // Normalize: array -> { variants }, null/undefined -> {}, object -> shallow copy
  let next: HookOptionsObject;
  if (!hookOptions) {
    next = {};
  } else if (Array.isArray(hookOptions)) {
    next = { variants: hookOptions };
  } else if (isObject(hookOptions)) {
    next = { ...hookOptions } as HookOptionsObject;
  } else {
    next = {};
  }
  const existing: TrackerMeta =
    next.trackerMeta && typeof next.trackerMeta === "object" && !Array.isArray(next.trackerMeta)
      ? (next.trackerMeta as TrackerMeta)
      : {};
  next.trackerMeta = { ...existing, ...patch };
  // Prune undefined keys so the stored shape stays clean
  for (const [k, v] of Object.entries(next.trackerMeta)) {
    if (v === undefined) delete (next.trackerMeta as Record<string, unknown>)[k];
  }
  return next as Prisma.InputJsonValue;
}
