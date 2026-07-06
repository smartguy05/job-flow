import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { SiteNav } from "@/components/SiteNav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JobFlow",
  description: "Tailored resumes + application tracking",
  appleWebApp: { capable: true, title: "JobFlow", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#182029" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser();

  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteNav user={user ? { email: user.email, name: user.name } : null} />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-24 md:pb-6">{children}</main>
      </body>
    </html>
  );
}
