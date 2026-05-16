import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Keyboard users: jump past nav into content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-[var(--color-text)] focus:text-[var(--color-text-on-dark)] focus:px-3 focus:py-1.5 focus:rounded-md focus:text-sm"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main-content" className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
