"use client";

import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { OFF_PLATFORM_BUTTON, OFF_PLATFORM_CONFIRM, OFF_PLATFORM_CONFIRM_BUTTON, OFF_PLATFORM_WARNING } from "@/lib/deal/off-platform";
import { Button } from "../../ui/Button";
import { Panel } from "../../ui/Panel";
import { StepError } from "./StepPanel";

/**
 * The buyer says they will pay another way (PLAN.md Decision 12).
 *
 * Deliberately a plain panel and not a warning box: Pay Pals is not telling
 * the buyer off and not talking them round, it is telling them what they
 * lose and getting out of the way. So no red, no small print, the whole
 * warning visible from the start, and a button that says what it does.
 *
 * The deliberate confirmation is a second press rather than an acknowledgment
 * checkbox. A checkbox is the pattern for continuing past a stop, which is a
 * choice the buyer can take back; this one ends Pay Pals' part of the deal
 * and cannot be taken back, so it says so and asks again.
 *
 * Named as a landmark rather than a heading: the title carries the word
 * "pay", and a second "Pay..." heading beside the Pay panel and the Payment
 * panel reads as a duplicate of them in a heading list.
 */
export function OffPlatformStep({ dealId, onDone }: { dealId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
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
        {confirming ? (
          <div className="mt-4" data-testid="off-platform-confirm">
            <p className="text-sm font-semibold leading-relaxed">{OFF_PLATFORM_CONFIRM}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={choose}>
                {busy ? "Recording" : OFF_PLATFORM_CONFIRM_BUTTON}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Not now
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="mt-4" onClick={() => setConfirming(true)}>
            {OFF_PLATFORM_BUTTON}
          </Button>
        )}
        <div className="mt-3">
          <StepError error={error} />
        </div>
      </Panel>
    </div>
  );
}
