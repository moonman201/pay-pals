"use client";

import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

/**
 * The seller answered outside Pay Pals and said no. The buyer pastes what
 * they said; it is recorded as a declined invite with the quote, and the
 * Buyer Pal reviews it next. The pal's rules only read the seller's own
 * lines, so a reply the buyer pastes into the chat is relayed this way.
 */
export function RefusalStep({ dealId, onDone }: { dealId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "decline"), { by: "buyer", reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <StepPanel id="refusal" title="Did the seller say no?" intro="If the seller answered outside Pay Pals and will not join, record what they said. Your pal reviews it before you do anything else.">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          The seller said no
        </Button>
      </StepPanel>
    );
  }

  return (
    <StepPanel id="refusal" title="What did the seller say?" intro="Paste their words. The refusal goes on the deal record with the quote.">
      <form onSubmit={submit} className="space-y-3">
        <textarea
          required
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: Friends and Family only, I am not paying fees."
          className="block w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Recording" : "Record the refusal"}
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
