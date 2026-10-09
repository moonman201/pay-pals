import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pay Pals",
  description: "Two AI agents, one safe deal. The Buyer Pal vets the listing, the Seller Pal locks the item into a PayPal Goods and Services payment, both keep proof until it arrives.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Dark navy is the site, for every visitor, whatever their device is set to. See app/tokens.css. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
