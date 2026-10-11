import type { Metadata, Viewport } from "next";
import { ThemeScript } from "@/components/ui/ThemeScript";
import { ThemeSync } from "@/components/ui/ThemeSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pay Pals",
  description: "Two AI agents, one safe deal. The Buyer Pal vets the listing, the Seller Pal locks the item into a PayPal Goods and Services payment, both keep proof until it arrives.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Night is the site, for every visitor, whatever their device is set to
 * (G16). That is what data-theme="dark" here is: the server renders it, so
 * night needs no JavaScript, survives a blocked script and never flashes.
 *
 * The boot script runs before the first paint and replaces it only from a
 * stored choice. It never reads the device, and no prefers-color-scheme
 * rule exists for it to read against (see app/tokens.css). The html element
 * is left out of hydration checking because that script writes to it.
 *
 * ThemeSync writes the same thing again on mount, a no-op on every normal
 * route and the only path on Next's error shell, where the script never
 * runs. See app/tokens.css and lib/theme.ts.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
