"use client";

import type { ItemCard, Message, Verdict } from "@pay-pals/contracts";
import type { ReactNode } from "react";
import { certRows } from "@/lib/deal/cert-compare";
import { certHeadline, graderName } from "@/lib/deal/cert-copy";
import { evidenceSourceId } from "@/lib/deal/evidence-source";
import { goLine } from "@/lib/deal/headline";
import { priceStance } from "@/lib/deal/price-stance";
import { sellerVoice } from "@/lib/deal/seller-voice";
import { verdictChips, type ChipTone, type VerdictChip } from "@/lib/deal/verdict-chips";
import { OVERALL_LABELS } from "@/lib/labels";
import { PalAvatar } from "../pal/PalAvatar";
import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";
import { ChipDeck, type DeckItem } from "../ui/ChipDeck";
import { Comparison } from "./Comparison";
import { FlagEvidence } from "./FlagEvidence";
import { PriceLine } from "./PriceLine";

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
 * The first thing in the room: one verdict, the pal that gave it, its reasons as chips and the one move.
 *
 * Every chip opens its evidence right there, under the row, one at a time: a flag's explanation with the
 * quote it rests on (linked to the chat message), the cert comparison as its table, the price check as
 * its line with the listings. Nothing the old review said above the fold is gone; it waits for a tap,
 * and no tap jumps down the page.
 */
export function VerdictCard({ verdict, card, chat, role, stale, children }: Props) {
  const seller = role === "seller";
  const say = (text: string) => (seller ? sellerVoice(text) : text);
  const style = STYLE[verdict.overall];
  const tone: ChipTone = verdict.overall === "go" ? "go" : verdict.overall;
  const open = verdict.overall === "go" ? verdict.questionsForSeller.length : 0;
  const chips = verdictChips(verdict, card);
  // The compact price line shows on the card itself whenever the price check has something honest to say.
  const showPrice = card !== null && verdict.priceCheck !== null && priceStance(verdict.priceCheck, card) !== null;

  const detailFor = (chip: VerdictChip): ReactNode => {
    if (chip.kind === "cert" && chip.cert) {
      return (
        <div className="text-sm leading-relaxed text-ink" data-testid="verdict-chip-detail" data-kind="cert">
          <p className="font-semibold">{say(certHeadline(chip.cert))}</p>
          <Comparison leftTitle="Card says" rightTitle={`${graderName(chip.cert)} record says`} rows={certRows(chip.cert, card?.title ?? null, card?.grade ?? null)} caption="The item card against the grader's record for this cert number" />
        </div>
      );
    }
    if (chip.kind === "price" && card && verdict.priceCheck) {
      return (
        <div className="text-sm leading-relaxed text-ink" data-testid="verdict-chip-detail" data-kind="price">
          <p>{chip.detail}</p>
          <PriceLine check={verdict.priceCheck} card={card} testId="price-line-chip" />
        </div>
      );
    }
    return (
      <div className="text-sm leading-relaxed text-ink" data-testid="verdict-chip-detail" data-kind="flag">
        <p>{say(chip.detail)}</p>
        {chip.evidence ? <FlagEvidence evidence={chip.evidence} always sourceMessageId={evidenceSourceId(chip.evidence, chat)} /> : null}
      </div>
    );
  };

  const items: DeckItem[] = chips.map((chip) => ({
    id: chip.id,
    testId: "verdict-chip",
    data: { tone: chip.tone, kind: chip.kind, ...(chip.flagCode ? { flag: chip.flagCode } : {}) },
    chipClass: CHIP_STYLE[chip.tone],
    chip: (
      <>
        <ToneIcon tone={chip.tone} />
        {chip.label}
      </>
    ),
    detail: detailFor(chip),
  }));

  return (
    <section aria-labelledby="verdict-card-title" id="buyer-pal-review" className="motion-reveal scroll-mt-4">
      <h2 id="verdict-card-title" className="sr-only">
        Buyer Pal review
      </h2>
      {stale ? (
        <p className="mb-2 rounded-lg bg-caution-soft px-3 py-2 text-xs text-caution">
          This review was for card version {stale.reviewed}. The card is now version {stale.current}, so it needs another look.
        </p>
      ) : null}
      <div className={`rounded-2xl border p-4 sm:p-5 ${style.box}`} data-testid="verdict" data-overall={verdict.overall}>
        <div className="flex items-center gap-4">
          <PalAvatar pal="buyer" size={64} />
          <div className="min-w-0">
            <p className={`flex items-center gap-2 text-4xl font-black leading-none tracking-tight ${style.word}`} data-testid="verdict-headline">
              <ToneIcon tone={tone} size={32} />
              {OVERALL_LABELS[verdict.overall]}
            </p>
            {WHAT_TO_DO[verdict.overall] || open > 0 ? (
              <p className="mt-1.5 text-sm font-semibold text-ink" data-testid="verdict-todo">
                {WHAT_TO_DO[verdict.overall] ?? goLine({ questionsForSeller: verdict.questionsForSeller }).replace(/^Looks good, /, "")}
              </p>
            ) : null}
          </div>
        </div>
        {items.length > 0 ? (
          <div className="mt-4" data-testid="verdict-reasons">
            <ChipDeck items={items} label="Why. Tap a reason for the pal's evidence." slotClassName="mt-3 rounded-xl border border-line bg-surface p-3" />
          </div>
        ) : null}
        {showPrice && card && verdict.priceCheck ? (
          <div className="mt-3 rounded-xl border border-line/60 bg-surface/60 px-3 py-1" data-testid="price-line-card">
            <PriceLine check={verdict.priceCheck} card={card} />
          </div>
        ) : null}
        {children ? <div className="mt-4 border-t border-line/60 pt-4">{children}</div> : null}
      </div>
    </section>
  );
}
