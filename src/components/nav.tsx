"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Sparkles,
  Eye,
  Newspaper,
  PenLine,
  ClipboardList,
  CalendarClock,
  MessageSquare,
  Zap,
  BrainCircuit,
  Wand2,
  Search,
  StickyNote,
  Library,
  ListChecks,
  ListTodo,
  Rocket,
  BookOpen,
  Images,
  CheckCircle2,
  Clapperboard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  external?: boolean;
};

// Daily post is the primary workflow now — it's where the hook, script,
// caption, hashtags, ManyChat wiring, and media for each guide live in
// one editor. Promoted to the top of the nav (right under Dashboard) so
// it's the first thing visible. "View guide" points at our own /guides
// public site instead of the retired Netlify host.
const items: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/daily-post", label: "Daily post", icon: Rocket },
  { href: "/published", label: "Published", icon: CheckCircle2 },
  { href: "/guides", label: "View guide", icon: BookOpen },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/hooks", label: "Hooks", icon: Sparkles },
  { href: "/creators", label: "Creators", icon: Eye },
  { href: "/browse", label: "Browse IG", icon: Search },
  { href: "/trends", label: "Trends", icon: Newspaper },
  { href: "/flip", label: "Flip", icon: Zap },
  { href: "/voice", label: "Voice", icon: BrainCircuit },
  { href: "/studio", label: "Studio", icon: Wand2 },
  {
    href: "https://avatar-studio-cc1g.onrender.com",
    label: "Avatar Studio",
    icon: Clapperboard,
    external: true,
  },
  { href: "/carousel", label: "Carousel", icon: Images },
  { href: "/compose", label: "Compose", icon: PenLine },
  { href: "/drafts", label: "Drafts", icon: ClipboardList },
  { href: "/tracker", label: "31-day tracker", icon: ListChecks },
  { href: "/log", label: "Inspo log", icon: ListTodo },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  {
    href: "https://ayla-prompts-dashboard.netlify.app",
    label: "Prompts",
    icon: Library,
    external: true,
  },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]" />
          <span className="font-semibold tracking-tight">Creator OS</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
          className="p-2 -mr-2 rounded-md hover:bg-[var(--color-surface-2)]"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop static, mobile drawer */}
      <aside
        id="mobile-nav-drawer"
        className={cn(
          "z-40 w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg)] flex flex-col",
          // Desktop: always visible, sticky
          "lg:flex lg:sticky lg:top-0 lg:h-screen",
          // Mobile: fixed drawer, slide in from left
          "fixed inset-y-0 left-0 h-full transition-transform duration-200 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Primary navigation"
      >
        <div className="px-5 py-6 hidden lg:block">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]" />
            <span className="font-semibold tracking-tight">Creator OS</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {items.map(({ href, label, icon: Icon, external }) => {
            const active =
              !external && (pathname === href || pathname.startsWith(href + "/"));
            const className = cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
              active
                ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
            );
            if (external) {
              return (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  <span aria-hidden className="text-xs opacity-60">↗</span>
                </a>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={className}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--color-border)]">
          <Link
            href="/api/auth/signout"
            className="block text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] px-3 py-2"
          >
            Sign out
          </Link>
        </div>
      </aside>
    </>
  );
}
