import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JobFlow",
  description: "Tailored resumes + application tracking",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/capture", label: "New application" },
  { href: "/analytics", label: "Analytics" },
  { href: "/profile", label: "Career profile" },
  { href: "/contacts", label: "Contacts" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();

  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header
          className="sticky top-0 z-10 border-b"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-bold text-lg" style={{ color: "var(--primary)" }}>
              Job<span style={{ color: "var(--accent)" }}>Flow</span>
            </Link>
            {user && (
              <>
                <nav className="flex items-center gap-1 text-sm overflow-x-auto">
                  {NAV.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      className="px-3 py-1.5 rounded-md whitespace-nowrap hover:opacity-80"
                      style={{ color: "var(--muted)" }}
                    >
                      {n.label}
                    </Link>
                  ))}
                </nav>
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <span className="hidden sm:inline whitespace-nowrap" style={{ color: "var(--muted)" }}>
                    {user.email || user.name || "Signed in"}
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
              </>
            )}
          </div>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
