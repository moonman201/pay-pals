"use client";

import type { DealState } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { issueChoicesFor } from "@/lib/deal/issue";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

interface Props {
  dealId: string;
  state: DealState;
  /** Choice id to start on, for example "arrival_mismatch" after a failed arrival check. */
  preselect?: string;
  onDone: () => void;
  onClose: () => void;
}

/** The buyer says why they are opening an issue. The confirm button is live at once; the evidence pack is built either way. */
export function IssueStep({ dealId, state, preselect, onDone, onClose }: Props) {
  const choices = issueChoicesFor(state);
  const [choiceId, setChoiceId] = useState<string>(choices.find((c) => c.id === preselect)?.id ?? choices[0]?.id ?? "other");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const choice = choices.find((c) => c.id === choiceId) ?? choices[0];
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const text = [choice.details, details.trim()].filter(Boolean).join(" ").slice(0, 300);
      await postJson(dealApi(dealId, "issue"), { reason: choice.reason, details: text });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the issue.");
    } finally {
      setBusy(false);
    }
  }

  const intro =
    state === "DELIVERED"
      ? "Tell your pal what is wrong. It builds the evidence pack for a PayPal dispute."
      : "The item has not been confirmed as delivered. Say what happened and your pal builds the evidence pack for an item-not-received dispute.";

  return (
    <StepPanel id="issue" title="Report an issue" intro={intro}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Reason</legend>
          {choices.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reason" value={c.id} checked={choiceId === c.id} onChange={() => setChoiceId(c.id)} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          <span className="font-semibold">Details (optional)</span>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={300} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="danger" disabled={busy}>
            {busy ? "Opening" : "Open the issue"}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
        <StepError error={error} />
      </form>
    </StepPanel>
  );
}
