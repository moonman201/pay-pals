"use client";

import type { CardField, Photo } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { PhotoInput } from "../../photos/PhotoInput";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

const FIELDS: { value: CardField; label: string }[] = [
  { value: "photos", label: "Photos" },
  { value: "serial", label: "Serial number" },
  { value: "conditionNotes", label: "Condition notes" },
  { value: "included", label: "What is included" },
  { value: "askingPrice", label: "Price" },
];

interface Props {
  dealId: string;
  /** What the buyer's pal asked for, if anything. */
  questions: string[];
  suggestions: Photo[];
  onDone: () => void;
}

/** The seller answers the buyer side with a reply and photos. Seller Pal saves a new card version. */
export function RequestStep({ dealId, questions, suggestions, onDone }: Props) {
  const [open, setOpen] = useState(questions.length > 0);
  const [field, setField] = useState<CardField>("photos");
  const [reply, setReply] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() && photos.length === 0) {
      setError("Write a reply or add a photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "card"), {
        request: { field, request: questions[0] ?? "Seller update" },
        sellerReply: reply.trim(),
        photos,
      });
      setReply("");
      setPhotos([]);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the card.");
    } finally {
      setBusy(false);
    }
  }

  const intro = questions.length > 0 ? `The buyer's pal asked: ${questions.join(" ")}` : "You can add photos or notes to the card until both sides agree.";

  if (!open) {
    return (
      <StepPanel id="request" title="Update the card" intro={intro}>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Add a photo or note
        </Button>
      </StepPanel>
    );
  }

  return (
    <StepPanel id="request" title={questions.length > 0 ? "Answer the buyer's pal" : "Update the card"} intro={intro}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-semibold">What this changes</span>
          <select value={field} onChange={(e) => setField(e.target.value as CardField)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm sm:w-64">
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-semibold">Your reply</span>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="For example: Added. About 11 days in smartwatch mode." className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </label>
        <PhotoInput value={photos} onChange={setPhotos} addedBy="seller" suggestions={suggestions} label="New photos" />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving" : "Save a new card version"}
          </Button>
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
        <StepError error={error} />
      </form>
    </StepPanel>
  );
}
