"use client";

import { isTerminal } from "@pay-pals/contracts";
import Link from "next/link";
import { useState } from "react";
import type { DealSnapshot } from "@/lib/deal/snapshot";
import { STATE_LABELS } from "@/lib/labels";
import { glanceTitle } from "@/lib/deal/short-title";
import { openFold } from "@/lib/client/open-fold";
import { HistoryBadge } from "./HistoryBadge";
import { ProgressDots } from "./ProgressDots";
import { otherRole, type Role } from "@/lib/role";
import { PalAvatar } from "../pal/PalAvatar";
import { Badge } from "../ui/Badge";
import { ThemeToggle } from "../ui/ThemeToggle";
import { IssueIcon, ShieldCheckIcon, ShieldStopIcon } from "../ui/icons";

function stateTone(state: DealSnapshot["deal"]["state"]): "accent" | "go" | "stop" | "caution" | "neutral" {
  if (state === "COMPLETE") return "go";
  if (state === "BLOCKED" || state === "ISSUE") return "stop";
  if (state === "CANCELLED") return "neutral";
  return "accent";
}

/** The state chip is plain text now, so the three end states keep their icon. */
function StateIcon({ state }: { state: DealSnapshot["deal"]["state"] }) {
  if (state === "COMPLETE") return <ShieldCheckIcon size={14} />;
  if (state === "BLOCKED") return <ShieldStopIcon size={14} />;
  if (state === "ISSUE") return <IssueIcon size={14} />;
  return null;
}

const NAV_LINK = "inline-flex min-h-11 items-center px-2 underline-offset-2 hover:underline";
const SWITCH_LINK = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2";

/**
 * The first line of the room: where you are, the item's short name and the deal's state, in as few
 * words as it takes. What used to sit here in full (who you are and the pal's colour, the example-deal
 * label, the history seal's sentence, the seven named steps) is in the Deal status section, one tap
 * away, and the chips here open it.
 */
export function DealHeader({ snapshot, role }: { snapshot: DealSnapshot; role: Role }) {
  const { deal, currentCard } = snapshot;
  const [showLinks, setShowLinks] = useState(false);
  const other = otherRole(role);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <header className="bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-black tracking-tight text-navy">
          <PalAvatar pal="buyer" size={20} />
          <PalAvatar pal="seller" size={20} className="-ml-3.5" />
          <span className="sr-only">Pay Pals</span>
        </Link>
        <nav className="no-print -mr-2 flex items-center text-xs font-semibold text-[var(--accent-ink)]">
          {/* The other side's pal, as the way to switch. Its name is in the link for a screen reader and the tooltip. */}
          <Link href={`/deals/${deal.id}?as=${other}`} className={SWITCH_LINK} title={"View as " + other}>
            <PalAvatar pal={other} size={24} />
            <span className="sr-only">View as {other}</span>
          </Link>
          {!isTerminal(deal.state) ? (
            <button type="button" onClick={() => setShowLinks((v) => !v)} className={NAV_LINK}>
              Deal links
            </button>
          ) : null}
          <ThemeToggle />
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pb-2">
        {/* A basis, not flex-1: with none, the chips squeezed the title to a one-word column at 390 px. */}
        <div className="min-w-0 flex-[1_1_16rem]">
          {/* Short here, in full on the item card, which is one tap down. */}
          <h1 className="text-xl font-bold leading-tight text-ink">{glanceTitle(currentCard)}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <PalAvatar pal={role} size={16} />
            <span className="sr-only">You are the {role}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stateTone(deal.state)} className="gap-1 py-1" data-testid="state-chip">
            <StateIcon state={deal.state} />
            {STATE_LABELS[deal.state]}
          </Badge>
          {snapshot.example ? (
            <button
              type="button"
              onClick={() => openFold("deal-status")}
              className="inline-flex min-h-11 items-center text-xs font-semibold text-muted underline-offset-2 hover:underline"
              data-testid="example-chip"
            >
              Example
            </button>
          ) : null}
          <HistoryBadge compact events={snapshot.events} historyHash={snapshot.payment?.historyHash ?? null} example={snapshot.example} />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-3">
        <ProgressDots state={deal.state} events={snapshot.events} />
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
