"use client";

import type { Deal, Photo } from "@pay-pals/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { PhotoInput } from "../photos/PhotoInput";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";

const field = "mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm";

/** The seller joins with photos and the listing text, or says they will not use Pay Pals. */
export function SellerJoinForm({ deal, uploadsEnabled = false }: { deal: Deal; uploadsEnabled?: boolean }) {
  const router = useRouter();
  const [displayName, setName] = useState(deal.seller.displayName);
  const [paypalEmail, setPaypalEmail] = useState(deal.seller.email);
  const [listing, setListing] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listingHasPrice = /\$\s?\d/.test(listing);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(deal.id, "seller-join"), {
        displayName,
        sellerPaypalEmail: paypalEmail,
        listingText: listing,
        sellerNotes: notes,
        photos,
        askingPrice: price.trim() ? Number(price) : undefined,
      });
      router.push(`/deals/${deal.id}?as=seller`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the deal.");
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(deal.id, "decline"), { by: "seller", reason });
      setDeclined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  if (declined) {
    return (
      <Panel title="Recorded" accent>
        <p className="text-sm">You chose not to use Pay Pals for this deal. The buyer has been told. Nothing else happens here.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {deal.listingUrl ? (
        <p className="text-sm">
          Listing:{" "}
          <a href={deal.listingUrl} target="_blank" rel="noreferrer" className="break-all font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
            {deal.listingUrl}
          </a>
        </p>
      ) : null}
      <form onSubmit={join} className="space-y-4 rounded-2xl border border-[var(--accent-line)] bg-surface p-5 shadow-sm">
        <h2 className="text-lg font-bold">Join and add your photos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-semibold">Your name</span>
            <input required value={displayName} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="text-sm">
            <span className="font-semibold">PayPal email that gets paid</span>
            <input required type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} className={field} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-semibold">Listing text or a few lines about the item</span>
          <textarea required minLength={10} rows={4} value={listing} onChange={(e) => setListing(e.target.value)} placeholder="Paste your listing, or say what it is, the condition and the price." className={field} />
        </label>
        <label className="block text-sm">
          <span className="font-semibold">Asking price in USD{listingHasPrice ? " (optional, the listing names one)" : ""}</span>
          <input type="number" min="0.01" step="0.01" required={!listingHasPrice} value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          <span className="font-semibold">Notes for your pal</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where the serial or cert number is, anything the card should say." className={field} />
        </label>
        <PhotoInput value={photos} onChange={setPhotos} addedBy="seller" label="Photos (serial or cert label, front, what is included)" uploadsEnabled={uploadsEnabled} />
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy && !declining ? "Building the card" : "Join and add your photos"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-stop">
            {error}
          </p>
        ) : null}
      </form>

      <div className="rounded-2xl border border-line bg-surface p-5">
        {declining ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">You will not use Pay Pals for this deal.</p>
            <label className="block text-sm">
              <span className="text-muted">Tell the buyer why (optional)</span>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={field} />
            </label>
            <div className="flex gap-2">
              <Button variant="danger" disabled={busy} onClick={decline}>
                Record that I will not use Pay Pals
              </Button>
              <Button variant="quiet" onClick={() => setDeclining(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setDeclining(true)} className="text-sm text-muted underline-offset-2 hover:underline">
            I will not use Pay Pals
          </button>
        )}
      </div>
    </div>
  );
}
