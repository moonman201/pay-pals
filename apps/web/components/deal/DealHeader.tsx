"use client";

import { isTerminal } from "@pay-pals/contracts";
import Link from "next/link";
import { useState } from "react";
import type { DealSnapshot } from "@/lib/deal/snapshot";
import { endSentence } from "@/lib/format";
import { STATE_LABELS } from "@/lib/labels";
import { HistoryBadge } from "./HistoryBadge";
import { otherRole, type Role } from "@/lib/role";
import { Badge } from "../ui/Badge";

function stateTone(state: DealSnapshot["deal"]["state"]): "accent" | "go" | "stop" | "caution" | "neutral" {
  if (state === "COMPLETE") return "go";
  if (state === "BLOCKED" || state === "ISSUE") return "stop";
  if (state === "CANCELLED") return "neutral";
  return "accent";
}

/** Who you are, where the deal stands, and the links for both sides. */
export function DealHeader({ snapshot, role }: { snapshot: DealSnapshot; role: Role }) {
  const { deal, currentCard } = snapshot;
  const [showLinks, setShowLinks] = useState(false);
  const other = otherRole(role);
  const me = role === "buyer" ? deal.buyer : deal.seller;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <header className="border-b border-[var(--accent-line)] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-sm font-black tracking-tight text-navy">
          Pay Pals
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-ink">{currentCard?.title ?? "New deal"}</h1>
          <p className="text-xs text-muted">
            {endSentence(`You are the ${role}${me ? `, ${me.displayName}` : ""}`)} {role === "buyer" ? "Your Buyer Pal is blue." : "Your Seller Pal is gold."}
          </p>
        </div>
        <Badge tone={stateTone(deal.state)}>{STATE_LABELS[deal.state]}</Badge>
        {snapshot.example ? (
          <Badge tone="neutral" className="font-normal" data-testid="example-label">
            Example deal, seeded from a scenario
          </Badge>
        ) : null}
        <HistoryBadge events={snapshot.events} historyHash={snapshot.payment?.historyHash ?? null} example={snapshot.example} />
        <nav className="no-print flex items-center gap-3 text-xs font-semibold text-[var(--accent-ink)]">
          <Link href={`/deals/${deal.id}?as=${other}`} className="underline-offset-2 hover:underline">
            View as {other}
          </Link>
          {snapshot.lockedCard ? (
            <Link href={`/deals/${deal.id}/evidence?as=${role}`} className="underline-offset-2 hover:underline">
              Evidence pack
            </Link>
          ) : null}
          {!isTerminal(deal.state) ? (
            <button type="button" onClick={() => setShowLinks((v) => !v)} className="underline-offset-2 hover:underline">
              Deal links
            </button>
          ) : null}
        </nav>
      </div>
      {showLinks ? (
        <div className="mx-auto max-w-6xl px-4 pb-3 text-xs text-muted">
          <p className="mb-1">Send each side its own link. No sign-up needed.</p>
          <div className="grid gap-1 sm:grid-cols-2">
            <code className="truncate rounded bg-wash px-2 py-1">{`${origin}/deals/${deal.id}?as=buyer`}</code>
            <code className="truncate rounded bg-wash px-2 py-1">{`${origin}/deals/${deal.id}?as=seller`}</code>
          </div>
        </div>
      ) : null}
    </header>
  );
}
