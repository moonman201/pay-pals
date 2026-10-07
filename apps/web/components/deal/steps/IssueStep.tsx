"use client";

import type { DealState } from "@pay-pals/contracts";
import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { ISSUE_REASON_LABELS, issueReasonsFor, type IssueReason } from "@/lib/deal/issue";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

interface Props {
  dealId: string;
  state: DealState;
  onDone: () => void;
  onClose: () => void;
}

/** The buyer says why they are opening an issue. The evidence pack is built either way. */
export function IssueStep({ dealId, state, onDone, onClose }: Props) {
  const reasons = issueReasonsFor(state);
  const [reason, setReason] = useState<IssueReason>(reasons[0] ?? "other");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "issue"), { reason, details: details.trim() });
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
          {reasons.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              {ISSUE_REASON_LABELS[r]}
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
