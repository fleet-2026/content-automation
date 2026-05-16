import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-wider text-[var(--color-accent)] mb-2">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Page not found.
        </h1>
        <p className="text-sm text-[var(--color-muted)] mb-5">
          The link you followed may be broken, or the page may have moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-[var(--color-accent)] text-[var(--color-text-on-dark)] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
