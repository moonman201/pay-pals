import Link from "next/link";
import type { DealEvent, DealState } from "@pay-pals/contracts";
import { ProgressStepper } from "../deal/ProgressStepper";
import { PalAvatar } from "../pal/PalAvatar";
import { ThemeToggle } from "../ui/ThemeToggle";
import type { Role } from "@/lib/role";

/**
 * The top of an evidence page: the wordmark, what this pack is about,
 * whatever badges the page has, where the deal stands, and the way back.
 * The same header whether the pack exists yet or not.
 */
export function EvidenceHeader({
  dealId,
  role,
  wordmark = "Pay Pals evidence pack",
  title,
  meta,
  badges,
  state,
  events,
  actions,
}: {
  dealId: string;
  role: Role;
  /** "Pay Pals evidence pack" once there is a pack. Before that there is none, so the page says only Pay Pals. */
  wordmark?: string;
  title: string;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  state: DealState;
  events: readonly DealEvent[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-sm font-black tracking-tight text-navy">
          <PalAvatar pal="buyer" size={20} />
          <PalAvatar pal="seller" size={20} className="-ml-4" />
          {wordmark}
        </p>
        <h1 className="mt-1 text-2xl font-black text-navy">{title}</h1>
        {meta ? <p className="mt-1 text-sm text-muted">{meta}</p> : null}
      </div>
      {badges ? <div className="flex w-full flex-wrap gap-2">{badges}</div> : null}
      <div className="w-full">
        <ProgressStepper state={state} events={events} />
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/deals/${dealId}?as=${role}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
          Back to the deal
        </Link>
        <ThemeToggle />
        {actions}
      </div>
    </header>
  );
}
