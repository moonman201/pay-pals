"use client";

import type { ItemCard, Message, Verdict } from "@pay-pals/contracts";
import type { ReactNode } from "react";
import { evidenceSourceId } from "@/lib/deal/evidence-source";
import { goLine } from "@/lib/deal/headline";
import { sellerVoice } from "@/lib/deal/seller-voice";
import { verdictChips, type ChipTone } from "@/lib/deal/verdict-chips";
import { OVERALL_LABELS } from "@/lib/labels";
import { openFold } from "@/lib/client/open-fold";
import { PalAvatar } from "../pal/PalAvatar";
import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";
import { ChipDeck, type DeckItem } from "../ui/ChipDeck";
import { FlagEvidence } from "./FlagEvidence";

const STYLE: Record<Verdict["overall"], { box: string; word: string }> = {
  go: { box: "border-go-line bg-go-soft", word: "text-go" },
  caution: { box: "border-caution-line bg-caution-soft", word: "text-caution" },
  stop: { box: "border-stop-line bg-stop-soft", word: "text-stop" },
};

const CHIP_STYLE: Record<ChipTone, string> = {
  go: "border-go-line bg-chip-go text-chip-go-ink",
  caution: "border-caution-line bg-chip-caution text-chip-caution-ink",
  stop: "border-stop-line bg-chip-stop text-chip-stop-ink",
};

/** What to do about it, in two words. A go has nothing to add. */
const WHAT_TO_DO: Record<Verdict["overall"], string | null> = { stop: "Don't pay.", caution: "Ask first.", go: null };

function ToneIcon({ tone, size = 16 }: { tone: ChipTone; size?: number }) {
  if (tone === "stop") return <StopIcon size={size} strokeWidth={2.5} />;
  if (tone === "caution") return <CautionIcon size={size} strokeWidth={2.5} />;
  return <CheckIcon size={size} strokeWidth={3} />;
}

interface Props {
  verdict: Verdict;
  card: ItemCard | null;
  /** The shared chat, so a flag's quote can link to the message it was taken from. */
  chat: readonly Message[];
  role: "buyer" | "seller";
  /** This review was for an older card version: it needs another look. */
  stale: { reviewed: number; current: number } | null;
  /** The one action. */
  children?: ReactNode;
}

/**
 * The first thing in the room: one verdict, the pal that gave it, three reasons as chips and the one move.
 *
 * A reason is a handle. Tapping a chip opens the pal's full sentence and the quote it rests on (for a
 * stop flag that is the seller's own words, linked to the chat message), so nothing the old review
 * said above the fold is gone, it just waits for a tap.
 */
export function VerdictCard({ verdict, card, chat, role, stale, children }: Props) {
  const seller = role === "seller";
  const say = (text: string) => (seller ? sellerVoice(text) : text);
  const style = STYLE[verdict.overall];
  const tone: ChipTone = verdict.overall === "go" ? "go" : verdict.overall;
  const open = verdict.overall === "go" ? verdict.questionsForSeller.length : 0;
  const chips = verdictChips(verdict, card);
  const items: DeckItem[] = chips.map((chip) => ({
    id: chip.id,
    testId: "verdict-chip",
    data: { tone: chip.tone },
    chipClass: CHIP_STYLE[chip.tone],
    chip: (
      <>
        <ToneIcon tone={chip.tone} />
        {chip.label}
      </>
    ),
    detail: (
      <div className="text-sm leading-relaxed text-ink" data-testid="verdict-chip-detail">
        <p>{say(chip.detail)}</p>
        {chip.evidence ? <FlagEvidence evidence={chip.evidence} always sourceMessageId={evidenceSourceId(chip.evidence, chat)} /> : null}
        {chip.opensCertTable ? (
          <button type="button" onClick={() => openFold("cert-check")} className="mt-1 inline-flex min-h-11 items-center font-semibold text-[var(--accent-ink)] underline underline-offset-2">
            Show the cert table
          </button>
        ) : null}
      </div>
    ),
  }));

  return (
    <section aria-labelledby="verdict-card-title" id="buyer-pal-review" className="motion-reveal flex flex-1 scroll-mt-4 flex-col">
      <h2 id="verdict-card-title" className="sr-only">
        Buyer Pal review
      </h2>
      {stale ? (
        <p className="mb-2 rounded-lg bg-caution-soft px-3 py-2 text-xs text-caution">
          This review was for card version {stale.reviewed}. The card is now version {stale.current}, so it needs another look.
        </p>
      ) : null}
      <div className={`flex flex-1 flex-col rounded-2xl border p-4 sm:p-5 ${style.box}`} data-testid="verdict" data-overall={verdict.overall}>
        <div className="flex items-center gap-4">
          <PalAvatar pal="buyer" size={64} />
          <div className="min-w-0">
            <p className={`flex items-center gap-2 text-4xl font-black leading-none tracking-tight ${style.word}`} data-testid="verdict-headline">
              <ToneIcon tone={tone} size={32} />
              {OVERALL_LABELS[verdict.overall]}
            </p>
            {WHAT_TO_DO[verdict.overall] || open > 0 ? (
              <p className="mt-1.5 text-sm font-semibold text-ink" data-testid="verdict-todo">
                {WHAT_TO_DO[verdict.overall] ?? goLine({ questionsForSeller: verdict.questionsForSeller }).replace(/^Looks good, /, "").replace(/^./, (c) => c.toUpperCase())}
              </p>
            ) : null}
          </div>
        </div>
        <div className="my-4" data-testid="verdict-reasons">
          <ChipDeck items={items} label="Why. Tap a reason for the pal's sentence and its evidence." slotClassName="mt-3 rounded-xl border border-line bg-surface p-3" />
        </div>
        {children ? <div className="mt-auto border-t border-line/60 pt-4">{children}</div> : null}
      </div>
    </section>
  );
}
