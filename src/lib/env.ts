/**
 * Env-var hygiene.
 *
 * Values copied into Vercel from a UTF-8-with-BOM .env.local will silently
 * carry a leading byte-order mark (U+FEFF). Most code paths don't care, but
 * OAuth providers reject client IDs with stray characters — and the BOM
 * happily encodes as `%EF%BB%BF` into URL query strings.
 *
 * Read every sensitive env var through `env()` and we get:
 *   - BOM stripped
 *   - Surrounding whitespace + quotes trimmed (people occasionally paste with quotes)
 *   - Undefined if the var is missing
 */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return undefined;
  return raw
    .replace(/^﻿+/, "") // BOM at start
    .replace(/﻿+$/, "") // BOM at end (rare but cheap to handle)
    .replace(/^["']|["']$/g, "") // accidental wrapping quotes
    .trim();
}

/** Like env() but throws when missing. Use for must-have keys. */
export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
