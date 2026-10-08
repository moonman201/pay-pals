"use client";

import { useState } from "react";
import { Button } from "../../ui/Button";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs">{value}</code>
      <Button variant="secondary" className="shrink-0 px-3 py-1" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** The PayPal sandbox test buyer a judge signs in with. Demo deals through the sandbox gateway only; no real money anywhere. */
export function SandboxBuyerNote({ email, password }: { email: string; password: string }) {
  return (
    <div className="mb-4 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3" data-testid="sandbox-buyer">
      <p className="text-sm font-semibold text-[var(--accent-ink)]">PayPal sandbox test buyer, no real money</p>
      <div className="mt-2 space-y-2">
        <CopyField label="Email" value={email} />
        <CopyField label="Password" value={password} />
      </div>
      <p className="mt-2 text-sm">Press the PayPal button, sign in with this test account, and approve. Nothing is charged.</p>
    </div>
  );
}
