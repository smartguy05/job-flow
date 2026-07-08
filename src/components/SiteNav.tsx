"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavUser = { email?: string | null; name?: string | null } | null;

// Full navigation. `primary` items appear in the mobile bottom tab bar (plus a "More" tab);
// everything shows in the desktop top bar and the mobile drawer.
const NAV = [
  { href: "/", label: "Dashboard", primary: true, icon: "🏠" },
  { href: "/calendar", label: "Calendar", primary: true, icon: "📅" },
  { href: "/capture", label: "New application", primary: true, icon: "＋", short: "New" },
  { href: "/analytics", label: "Analytics", primary: true, icon: "📊" },
  { href: "/offers", label: "Offers", icon: "⚖️" },
  { href: "/profile", label: "Career profile", icon: "👤" },
  { href: "/contacts", label: "Contacts", icon: "📇" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const PRIMARY = NAV.filter((n) => n.primary);
const OVERFLOW = NAV.filter((n) => !n.primary);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const label = user?.email || user?.name || "Signed in";

  return (
    <>
      {/* Header — shown on all sizes. On mobile it's slim (logo + hamburger); on desktop it
          also holds the inline nav + user + sign out. */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="font-bold text-lg" style={{ color: "var(--primary)" }}>
            Job<span style={{ color: "var(--accent)" }}>Flow</span>
          </Link>

          {user && (
            <>
              {/* Desktop inline nav */}
              <nav className="hidden md:flex items-center gap-1 text-sm">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="px-3 py-1.5 rounded-md whitespace-nowrap hover:opacity-80"
                    style={
                      isActive(pathname, n.href)
                        ? { color: "var(--accent)", background: "var(--surface-2)" }
                        : { color: "var(--muted)" }
                    }
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto hidden md:flex items-center gap-3 text-sm">
                <span className="whitespace-nowrap" style={{ color: "var(--muted)" }}>
                  {label}
                </span>
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-md whitespace-nowrap hover:opacity-80"
                    style={{ color: "var(--muted)" }}
                  >
                    Sign out
                  </button>
                </form>
              </div>

              {/* Mobile hamburger */}
              <button
                type="button"
                className="md:hidden ml-auto p-2 -mr-2 rounded-md"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
                style={{ color: "var(--muted)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {user && (
        <>
          {/* Mobile bottom tab bar */}
          <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t flex items-stretch pb-safe"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            aria-label="Primary"
          >
            {PRIMARY.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-medium"
                  style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                >
                  <span aria-hidden className="text-lg leading-none">{n.icon}</span>
                  {n.short ?? n.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-medium"
              style={{ color: OVERFLOW.some((n) => isActive(pathname, n.href)) ? "var(--accent)" : "var(--muted)" }}
            >
              <span aria-hidden className="text-lg leading-none">☰</span>
              More
            </button>
          </nav>

          {/* Mobile drawer */}
          {drawerOpen && (
            <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
              <div
                className="absolute inset-0"
                style={{ background: "rgba(0,0,0,0.4)" }}
                onClick={() => setDrawerOpen(false)}
              />
              <div
                className="absolute right-0 top-0 h-full w-72 max-w-[80%] flex flex-col shadow-xl pt-safe"
                style={{ background: "var(--surface)" }}
              >
                <div
                  className="h-14 px-4 flex items-center justify-between border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="font-bold text-lg" style={{ color: "var(--primary)" }}>
                    Job<span style={{ color: "var(--accent)" }}>Flow</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setDrawerOpen(false)}
                    className="p-2 -mr-2 rounded-md"
                    style={{ color: "var(--muted)" }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                </div>
                <nav className="flex flex-col p-2 gap-0.5 overflow-y-auto flex-1">
                  {NAV.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm"
                      style={
                        isActive(pathname, n.href)
                          ? { color: "var(--accent)", background: "var(--surface-2)" }
                          : { color: "var(--foreground)" }
                      }
                    >
                      <span aria-hidden className="text-lg leading-none w-6 text-center">{n.icon}</span>
                      {n.label}
                    </Link>
                  ))}
                </nav>
                <div className="border-t p-3 flex flex-col gap-2" style={{ borderColor: "var(--border)" }}>
                  <span className="text-xs px-1 truncate" style={{ color: "var(--muted)" }}>{label}</span>
                  <form action="/api/auth/logout" method="post">
                    <button type="submit" className="btn btn-ghost w-full justify-center">Sign out</button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
