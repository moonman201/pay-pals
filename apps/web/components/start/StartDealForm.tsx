"use client";

import { ALL_FIXTURES, type Photo, type ScenarioFixture } from "@pay-pals/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import type { Role } from "@/lib/role";
import { PhotoInput } from "../photos/PhotoInput";
import { Button } from "../ui/Button";

const field = "mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm";

/** Either side starts a deal. The seller gives a PayPal email; the buyer invites the seller by email. */
export function StartDealForm() {
  const router = useRouter();
  const [side, setSide] = useState<Role>("seller");
  const [myName, setMyName] = useState("");
  const [myEmail, setMyEmail] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherEmail, setOtherEmail] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [listing, setListing] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function fillFrom(f: ScenarioFixture) {
    setListing(f.listingText);
    setNotes(f.sellerNotes);
    setPhotos(f.listingPhotos);
    const me = side === "seller" ? f.seller : f.buyer;
    const other = side === "seller" ? f.buyer : f.seller;
    setMyName(me.displayName);
    setMyEmail(me.email);
    setOtherName(other.displayName);
    setOtherEmail(other.email);
    setPaypalEmail(f.cards[0]?.sellerPaypalEmail ?? f.seller.email);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const me = { displayName: myName, email: myEmail };
    const other = { displayName: otherName, email: otherEmail };
    const seller = side === "seller" ? me : other;
    const buyer = side === "buyer" ? me : null;
    try {
      const { dealId } = await postJson<{ dealId: string }>("/api/deals", {
        startedBy: side,
        seller,
        buyer,
        listingText: listing,
        sellerNotes: notes,
        photos,
        sellerPaypalEmail: side === "seller" ? paypalEmail || myEmail : otherEmail,
      });
      router.push(`/deals/${dealId}?as=${side}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the deal.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`theme-${side} space-y-5 rounded-2xl border border-[var(--accent-line)] bg-white p-5 shadow-sm`}>
      <div role="radiogroup" aria-label="I am the" className="grid grid-cols-2 gap-2">
        {(["seller", "buyer"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={side === r}
            onClick={() => setSide(r)}
            className={`theme-${r} rounded-lg border px-3 py-2 text-sm font-semibold ${side === r ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-line text-muted"}`}
          >
            I am the {r}
          </button>
        ))}
      </div>

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
        {side === "seller" ? (
          <label className="text-sm sm:col-span-2">
            <span className="font-semibold">PayPal email that gets paid</span>
            <input type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="Same as your email if blank" className={field} />
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="font-semibold">Seller&apos;s name</span>
              <input required value={otherName} onChange={(e) => setOtherName(e.target.value)} className={field} />
            </label>
            <label className="text-sm">
              <span className="font-semibold">Seller&apos;s email</span>
              <input required type="email" value={otherEmail} onChange={(e) => setOtherEmail(e.target.value)} className={field} />
            </label>
          </>
        )}
      </div>

      <label className="block text-sm">
        <span className="font-semibold">Listing text</span>
        <textarea required minLength={10} rows={5} value={listing} onChange={(e) => setListing(e.target.value)} placeholder="Paste the listing from the online marketplace." className={field} />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">{side === "seller" ? "Notes for your pal" : "Notes"}</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the card should say." className={field} />
      </label>
      <PhotoInput value={photos} onChange={setPhotos} addedBy={side} label="Listing photos" />

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
