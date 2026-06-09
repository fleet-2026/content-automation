import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getServerSession } from "@/lib/auth-server";
import { LogoutButton } from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "Fleet Admin",
  description: "Fleet management — vehicles, drivers, licenses, trips",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/drivers", label: "Drivers" },
  { href: "/licenses", label: "Licenses & Expiries" },
  { href: "/trips", label: "Trips" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  // Signed-out (e.g. /login): render children full-bleed without the nav shell.
  if (!session) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">
              Fleet<span>OS</span>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="sidebar-foot">
              <div className="muted" style={{ fontSize: 13 }}>{session.name}</div>
              <div className="muted" style={{ fontSize: 11 }}>{session.role}</div>
              <LogoutButton />
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
