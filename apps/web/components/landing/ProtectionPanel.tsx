"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { Button } from "../ui/Button";

const field = "mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm";

/**
 * The main way in: a payment-screen style panel. The buyer gives the seller's
 * PayPal email and the listing link, plus a name and email of their own, and
 * gets an invite link to send. No account.
 */
export function ProtectionPanel() {
  const router = useRouter();
  const [sellerEmail, setSellerEmail] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { dealId } = await postJson<{ dealId: string }>("/api/deals/invite", {
        buyer: { displayName: name, email },
        sellerEmail,
        listingUrl: listingUrl.trim() || null,
      });
      router.push(`/deals/${dealId}?as=buyer`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the deal.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="theme-buyer rounded-2xl border border-[var(--accent-line)] bg-white p-5 shadow-sm sm:p-6" aria-labelledby="protection-title">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue">Buying from a stranger</p>
      <h2 id="protection-title" className="mt-1 text-2xl font-bold text-navy">
        Use Pay Pals Protection
      </h2>
      <p className="mt-1 text-sm text-muted">
        Paste the seller&apos;s PayPal email and the listing. You get a link to send them. Their pal builds the item card, your pal checks it, and you pay only through
        PayPal Goods and Services.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="font-semibold">Seller&apos;s PayPal email</span>
          <input required type="email" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} placeholder="seller@example.com" className={field} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-semibold">Listing link</span>
          <input type="url" value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} placeholder="https://marketplace.example/listings/..." className={field} />
        </label>
        <label className="text-sm">
          <span className="font-semibold">Your name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          <span className="font-semibold">Your email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
      </div>
      <Button type="submit" disabled={busy} className="mt-4 w-full sm:w-auto">
        {busy ? "Starting" : "Use Pay Pals Protection"}
      </Button>
      <p className="mt-2 text-xs text-muted">No account needed. Nothing is charged until both sides agree to the item card.</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-stop">
          {error}
        </p>
      ) : null}
    </form>
  );
}
