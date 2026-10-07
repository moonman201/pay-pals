"use client";

import type { Photo } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { PhotoInput } from "../../photos/PhotoInput";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

/** The buyer shows the Buyer Pal what arrived. The pal compares it to the locked card. */
export function ArrivalStep({ dealId, suggestions, onDone }: { dealId: string; suggestions: Photo[]; onDone: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "arrival"), { photos });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the arrival check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepPanel id="arrival" title="Arrival check" intro="Add a photo of the back of the item with the serial visible. Your pal compares it to the locked card before you complete the deal.">
      <form onSubmit={submit} className="space-y-4">
        <PhotoInput value={photos} onChange={setPhotos} addedBy="buyer" suggestions={suggestions} label="Arrival photos" />
        <Button type="submit" disabled={busy || photos.length === 0}>
          {busy ? "Checking" : "Ask my pal to check"}
        </Button>
        <StepError error={error} />
      </form>
    </StepPanel>
  );
}
