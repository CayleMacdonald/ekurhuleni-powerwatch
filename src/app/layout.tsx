import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { isDemoMode } from "@/lib/config";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ekurhuleni PowerWatch – Live electricity outages",
  description: "Live electricity outage and restoration updates for Ekurhuleni, Gauteng. Independent community service – not an official municipal website.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b3358" };

const NAV = [
  { href: "/", label: "Live map" },
  { href: "/analytics", label: "Analytics" },
  { href: "/report", label: "Report outage" },
  { href: "/settings", label: "My alerts" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  let isAdmin = false;
  if (!demo) {
    try {
      isAdmin = (await getSessionUser()).isAdmin;
    } catch {}
  }
  return (
    <html lang="en-ZA">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-gold-400 focus:px-3 focus:py-2">
          Skip to content
        </a>
        {demo && (
          <div role="status" className="bg-gold-400 px-4 py-2 text-center text-sm font-semibold text-slate-900">
            DEMONSTRATION DATA – these outages are invented to show how the app works. No live sources are connected yet.
          </div>
        )}
        <header className="bg-brand-900 text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-gold-400 text-brand-900">⚡</span>
              Ekurhuleni <span className="text-gold-400">PowerWatch</span>
            </Link>
            <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 hover:bg-white/10">{n.label}</Link>
              ))}
              {isAdmin && <Link href="/admin" className="rounded-md px-3 py-2 text-gold-400 hover:bg-white/10">Admin</Link>}
            </nav>
          </div>
          <div className="h-1 bg-gradient-to-r from-gold-500 via-st-restored to-brand-600" aria-hidden />
        </header>
        <main id="main" className="mx-auto max-w-7xl px-4 py-5">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-slate-500">
          <p>
            PowerWatch is an independent information service and is <strong>not</strong> operated by the City of Ekurhuleni or Eskom. Information is only shown
            when published by a listed source or reported by residents; unverified items are labelled. In an emergency or to report a fault officially,
            use the municipality&apos;s official channels. Estimated restoration times can change.
          </p>
        </footer>
      </body>
    </html>
  );
}
