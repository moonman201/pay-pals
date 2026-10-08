"use client";

import { ALL_FIXTURES, type Photo, type ScenarioFixture } from "@pay-pals/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { PhotoInput } from "../photos/PhotoInput";
import { Button } from "../ui/Button";

const field = "mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm";

/** The seller lists first and shares the link. Buyers usually start from the landing page instead. */
export function StartDealForm({ uploadsEnabled = false }: { uploadsEnabled?: boolean }) {
  const router = useRouter();
  const [myName, setMyName] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [listing, setListing] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listingHasPrice = /\$\s?\d/.test(listing);

  function fillFrom(f: ScenarioFixture) {
    setListing(f.listingText);
    setNotes(f.sellerNotes);
    setPhotos(f.listingPhotos);
    setMyName(f.seller.displayName);
    setMyEmail(f.seller.email);
    setPaypalEmail(f.cards[0]?.sellerPaypalEmail ?? f.seller.email);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { dealId } = await postJson<{ dealId: string }>("/api/deals", {
        seller: { displayName: myName, email: myEmail },
        listingText: listing,
        sellerNotes: notes,
        photos,
        sellerPaypalEmail: paypalEmail || myEmail,
        askingPrice: price.trim() ? Number(price) : undefined,
      });
      router.push(`/deals/${dealId}?as=seller`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the deal.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="theme-seller space-y-5 rounded-2xl border border-[var(--accent-line)] bg-surface p-5 shadow-sm">
      <div className="rounded-lg bg-wash p-3 text-xs text-muted">
        <span className="font-semibold">Demo listings:</span>{" "}
        {ALL_FIXTURES.map((f) => (
          <button key={f.id} type="button" onClick={() => fillFrom(f)} className="mr-2 underline-offset-2 hover:underline">
            {f.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-semibold">Your name</span>
          <input required value={myName} onChange={(e) => setMyName(e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          <span className="font-semibold">Your email</span>
          <input required type="email" value={myEmail} onChange={(e) => setMyEmail(e.target.value)} className={field} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-semibold">PayPal email that gets paid</span>
          <input type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="Same as your email if blank" className={field} />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-semibold">Listing text</span>
        <textarea required minLength={10} rows={5} value={listing} onChange={(e) => setListing(e.target.value)} placeholder="Paste the listing from the online marketplace." className={field} />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Asking price in USD{listingHasPrice ? " (optional, the listing names one)" : ""}</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          required={!listingHasPrice}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={listingHasPrice ? "Leave blank to use the price in the listing" : "The listing has no price. Enter one."}
          className={field}
        />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Notes for your pal</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the card should say." className={field} />
      </label>
      <PhotoInput value={photos} onChange={setPhotos} addedBy="seller" label="Listing photos" uploadsEnabled={uploadsEnabled} />

      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {busy ? "Building the card" : "Build the card and start"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-stop">
          {error}
        </p>
      ) : null}
    </form>
  );
}
