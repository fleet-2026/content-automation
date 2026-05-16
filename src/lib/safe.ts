/**
 * Wrap a DB / API call so that the calling page renders even when the database
 * isn't configured yet. Returns the fallback on any error.
 *
 * Errors are LOGGED (not silently swallowed) so production failures surface
 * in Vercel logs / Sentry. Pass a label as the third arg for easier triage.
 */
export async function safe<T>(
  promise: Promise<T> | (() => Promise<T>),
  fallback: T,
  label?: string,
): Promise<T> {
  try {
    const v = typeof promise === "function" ? await promise() : await promise;
    return v;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[safe${label ? `:${label}` : ""}] swallowed:`, msg);
    return fallback;
  }
}
