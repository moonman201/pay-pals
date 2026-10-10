"use client";

import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { OFF_PLATFORM_BUTTON, OFF_PLATFORM_CHECKBOX, OFF_PLATFORM_WARNING } from "@/lib/deal/off-platform";
import { Button } from "../../ui/Button";
import { Panel } from "../../ui/Panel";
import { StepError } from "./StepPanel";

/**
 * The buyer says they will pay another way (PLAN.md Decision 12).
 *
 * Deliberately a plain panel and not a warning box: Pay Pals is not telling
 * the buyer off and not talking them round, it is telling them what they
 * lose and getting out of the way. So no red, no small print, nothing
 * hidden behind a disclosure, and the button says what it does. The
 * acknowledgment is the same pattern as a non-payment stop, because the
 * choice is the buyer's to make and theirs to carry.
 *
 * Named as a landmark rather than a heading: the title carries the word
 * "pay", and a second "Pay..." heading beside the Pay panel and the Payment
 * panel reads as a duplicate of them in a heading list. The region keeps the
 * name for assistive tech.
 */
export function OffPlatformStep({ dealId, onDone }: { dealId: string; onDone: () => void }) {
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "off-platform"));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that.");
      setBusy(false);
    }
  }

  return (
    <div id="step-off-platform">
      <Panel title="Paying another way" labelAs="region">
        <div className="space-y-2 text-sm leading-relaxed" data-testid="off-platform-warning">
          {OFF_PLATFORM_WARNING.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" data-testid="off-platform-understood" />
          <span>{OFF_PLATFORM_CHECKBOX}</span>
        </label>
        <Button variant="secondary" className="mt-3" disabled={!understood || busy} onClick={choose}>
          {busy ? "Recording" : OFF_PLATFORM_BUTTON}
        </Button>
        <div className="mt-3">
          <StepError error={error} />
        </div>
      </Panel>
    </div>
  );
}
