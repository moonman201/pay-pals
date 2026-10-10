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
 * The colour mode follows the device and nothing is forced here. The boot
 * script writes data-theme on this element before the first paint when the
 * visitor has chosen a mode, which is why the html element is left out of
 * hydration checking. ThemeSync writes the same thing again on mount, which
 * is a no-op here and the only path on an error shell, where the script
 * never runs. See app/tokens.css and lib/theme.ts.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
