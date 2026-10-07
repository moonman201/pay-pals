"use client";

import { useState } from "react";
import { dealApi, postJson } from "@/lib/client/api";
import { Button } from "../../ui/Button";
import { StepError, StepPanel } from "./StepPanel";

/** A buyer opening a deal link for the first time gives a name and an email. No account. */
export function JoinForm({ dealId, onDone }: { dealId: string; onDone: () => void }) {
  const [displayName, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson(dealApi(dealId, "join"), { displayName, email });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepPanel id="join" title="Join as the buyer" intro="Tell the seller who you are. Your Buyer Pal checks the deal before any money moves.">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <input required placeholder="Your name" value={displayName} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm" />
        <input required type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm" />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Joining" : "Join the deal"}
          </Button>
        </div>
        <StepError error={error} />
      </form>
    </StepPanel>
  );
}
