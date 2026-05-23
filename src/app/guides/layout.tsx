import Link from "next/link";

/**
 * Public layout for /guides — distinct from the authed (app) shell.
 * No sidebar, no auth banner, no dashboard nav. Just a quiet top
 * header + the page content + a small footer. Designed for SEO and
 * for embedding into an external site via iframe or domain alias.
 */
export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  return (
    // `guides-theme` swaps in the green + yellow palette via CSS var
    // overrides — scoped to this subtree only, leaves dashboard alone.
    <div className="guides-theme min-h-screen flex flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/guides"
            className="font-display text-xl tracking-tight"
            title="All guides"
          >
            The <span className="font-italic-accent text-blush">Guides.</span>
          </Link>
          <nav className="text-sm text-[var(--color-muted)] flex items-center gap-5">
            <Link
              href="/guides"
              className="hover:text-[var(--color-text)] transition"
            >
              All guides
            </Link>
            {/* Outbound link to the brand site. Update to whatever the
                user's canonical website is — easy to swap. */}
            <a
              href="https://www.instagram.com/earnwith.ai"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--color-text)] transition"
            >
              Follow
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[var(--color-border)] mt-16">
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-[var(--color-muted)] flex flex-col sm:flex-row gap-2 items-center justify-between">
          <span>
            © {new Date().getFullYear()} Creator OS — daily AI guides.
          </span>
          <Link href="/guides" className="hover:text-[var(--color-text)]">
            View all guides →
          </Link>
        </div>
      </footer>
    </div>
  );
}
