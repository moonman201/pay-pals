"use client";

import { CARRIERS, type Carrier, type ChecklistItem, type Photo } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import type { DemoHints } from "@/lib/deal/snapshot";
import { PhotoInput } from "../../photos/PhotoInput";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

interface Props {
  dealId: string;
  checklist: ChecklistItem[];
  palMessage: string | null;
  demo: DemoHints["packing"];
  onDone: () => void;
}

/** The seller works through the Seller Pal's checklist, adds packing photos and tracking. */
export function ShipStep({ dealId, checklist, palMessage, demo, onDone }: Props) {
  const [done, setDone] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [carrier, setCarrier] = useState<Carrier>(demo?.carrier ?? "USPS");
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "ship"), { carrier, trackingNumber: tracking.trim(), packingPhotos: photos, doneIds: done });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the shipment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepPanel id="ship" title="Pack and ship" intro={palMessage}>
      <form onSubmit={submit} className="space-y-4">
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.id}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={done.includes(c.id)} onChange={() => toggle(c.id)} className="mt-1" />
                <span>
                  {c.label}
                  {c.required ? <span className="ml-1 text-xs text-muted">(required)</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <PhotoInput value={photos} onChange={setPhotos} addedBy="seller" suggestions={demo?.photos ?? []} label="Packing photos" />
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="block text-sm">
            <span className="font-semibold">Carrier</span>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm">
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold">Tracking number</span>
            <input required value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={64} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm font-mono" />
          </label>
        </div>
        {demo ? (
          <Button variant="quiet" onClick={() => { setCarrier(demo.carrier); setTracking(demo.trackingNumber); }}>
            Use the demo tracking number
          </Button>
        ) : null}
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving" : "Mark as shipped"}
          </Button>
        </div>
        <StepError error={error} />
      </form>
    </StepPanel>
  );
}
