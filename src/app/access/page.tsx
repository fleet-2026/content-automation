/**
 * Shared-password gate. Submitted POST goes to the proxy which sets the
 * signed cookie on success. Pure server component — no client JS needed.
 *
 * Only reachable in production when SHARED_PASSWORD env var is set.
 * In all other modes the proxy lets every request through and this page
 * is never rendered.
 */
export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp.error === "1";
  const rateLimited = sp.error === "rate_limited";
  const from = sp.from && sp.from.startsWith("/") ? sp.from : "";

  // Build action URL with the `from` param preserved so the proxy can
  // redirect the user back to their intended destination after entering.
  const actionUrl = from ? `/access?from=${encodeURIComponent(from)}` : "/access";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        method="POST"
        action={actionUrl}
        className="w-full max-w-sm bg-[var(--color-surface)] border rounded-2xl p-8 shadow-xl"
      >
        <div className="mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight">Descon Fleet</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Enter the shared access password to continue.
          </p>
        </div>

        <label htmlFor="access-password" className="block text-sm mb-1">
          Password
        </label>
        <input
          id="access-password"
          name="password"
          type="password"
          autoFocus
          required
          autoComplete="current-password"
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-2)] border outline-none focus:border-[var(--color-accent)] mb-4"
        />

        {hasError && (
          <p className="text-sm text-red-800 mb-4" role="alert">
            Wrong password. Try again.
          </p>
        )}
        {rateLimited && (
          <p className="text-sm text-red-800 mb-4" role="alert">
            Too many attempts. Wait 60 seconds and try again.
          </p>
        )}

        <button
          type="submit"
          className="w-full py-2 rounded-lg bg-[var(--color-accent)] text-[var(--color-text-on-dark)] font-semibold"
        >
          Enter
        </button>

        <p className="text-[11px] text-[var(--color-muted)] mt-6">
          Access lasts 30 days on this browser. Close the tab anytime —
          you&apos;ll come right back to the dashboard when you return.
        </p>
      </form>
    </div>
  );
}
