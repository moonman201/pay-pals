"use client";

import { isTerminal } from "@pay-pals/contracts";
import Link from "next/link";
import { useState } from "react";
import type { DealSnapshot } from "@/lib/deal/snapshot";
import { endSentence } from "@/lib/format";
import { STATE_LABELS } from "@/lib/labels";
import { shortTitle } from "@/lib/deal/short-title";
import { HistoryBadge } from "./HistoryBadge";
import { ProgressStepper } from "./ProgressStepper";
import { otherRole, type Role } from "@/lib/role";
import { PalAvatar } from "../pal/PalAvatar";
import { Badge } from "../ui/Badge";
import { ThemeToggle } from "../ui/ThemeToggle";

function stateTone(state: DealSnapshot["deal"]["state"]): "accent" | "go" | "stop" | "caution" | "neutral" {
  if (state === "COMPLETE") return "go";
  if (state === "BLOCKED" || state === "ISSUE") return "stop";
  if (state === "CANCELLED") return "neutral";
  return "accent";
}

const NAV_LINK = "inline-flex min-h-11 items-center px-2 underline-offset-2 hover:underline";

/** Who you are, where the deal stands, and the links for both sides. The stepper sits under the banner, outside it. */
export function DealHeader({ snapshot, role }: { snapshot: DealSnapshot; role: Role }) {
  const { deal, currentCard } = snapshot;
  const [showLinks, setShowLinks] = useState(false);
  const other = otherRole(role);
  const me = role === "buyer" ? deal.buyer : deal.seller;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <>
      <header className="bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4">
          <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-black tracking-tight text-navy">
            <PalAvatar pal="buyer" size={20} />
            <PalAvatar pal="seller" size={20} className="-ml-3.5" />
            Pay Pals
          </Link>
          <nav className="no-print -mr-2 flex items-center text-xs font-semibold text-[var(--accent-ink)]">
            <Link href={`/deals/${deal.id}?as=${other}`} className={NAV_LINK}>
              View as {other}
            </Link>
            {snapshot.lockedCard && snapshot.hasEvidence ? (
              <Link href={`/deals/${deal.id}/evidence?as=${role}`} className={NAV_LINK}>
                Evidence pack
              </Link>
            ) : null}
            {!isTerminal(deal.state) ? (
              <button type="button" onClick={() => setShowLinks((v) => !v)} className={NAV_LINK}>
                Deal links
              </button>
            ) : null}
            <ThemeToggle />
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-2">
          {/* A basis, not flex-1: with none, the long history chip squeezed the title to a one-word column at 390 px. */}
          <div className="min-w-0 flex-[1_1_18rem]">
            {/* Short here, in full on the item card, which is one scroll down. */}
            <h1 className="text-lg font-bold leading-tight text-ink">{shortTitle(currentCard)}</h1>
            <p className="mt-0.5 text-xs text-muted">
              {endSentence(`You are the ${role}${me ? `, ${me.displayName}` : ""}`)}{" "}
              <span className="inline-flex items-center gap-1 align-middle">
                <PalAvatar pal={role} size={16} />
                {role === "buyer" ? "Your Buyer Pal is blue." : "Your Seller Pal is gold."}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stateTone(deal.state)} className="py-1" data-testid="state-chip">
              {STATE_LABELS[deal.state]}
            </Badge>
            {snapshot.example ? (
              <Badge tone="neutral" className="py-1 font-normal" data-testid="example-label">
                Example deal, seeded from a scenario
              </Badge>
            ) : null}
            <HistoryBadge events={snapshot.events} historyHash={snapshot.payment?.historyHash ?? null} example={snapshot.example} />
          </div>
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
      {/* Outside the banner, so a step name such as "Reviewed" never shadows the state badge. */}
      <div className="border-b border-[var(--accent-line)] bg-surface">
        <div className="mx-auto max-w-6xl px-4 pb-1">
          <ProgressStepper state={deal.state} events={snapshot.events} />
        </div>
      </div>
    </>
  );
}
