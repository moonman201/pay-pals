"use client";

import type { Deal } from "@pay-pals/contracts";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { StepPanel } from "./StepPanel";

/** What the buyer sees while the seller has not joined: the link to send, and what happens next. */
export function InvitePanel({ deal }: { deal: Deal }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}/deals/${deal.id}/join?as=seller`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <StepPanel
      id="invite"
      title="Send this link to the seller"
      intro={`The seller (${deal.seller.email}) has not joined yet. Pay Pals does not email them in this version; send the link yourself, by the marketplace chat or any way you talk to them.`}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={link} aria-label="Invite link for the seller" className="min-w-0 flex-1 rounded-lg border border-line bg-wash px-3 py-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {deal.listingUrl ? (
        <p className="mt-3 text-sm text-muted">
          Listing:{" "}
          <a href={deal.listingUrl} target="_blank" rel="noreferrer" className="break-all underline-offset-2 hover:underline">
            {deal.listingUrl}
          </a>
        </p>
      ) : null}
      <p className="mt-3 text-sm text-muted">
        If the seller says no and asks for Friends and Family or another way to pay, paste their reply into the deal chat and ask your pal to review it.
      </p>
    </StepPanel>
  );
}
