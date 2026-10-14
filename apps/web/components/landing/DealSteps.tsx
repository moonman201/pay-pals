"use client";

import { PalAvatar } from "../pal/PalAvatar";
import { ChipDeck, type DeckItem } from "../ui/ChipDeck";
import { BoxIcon, LinkIcon, ShieldCheckIcon } from "../ui/icons";

/**
 * How a deal goes, as three icons with a few words each. The paragraphs the section used to carry
 * are the taps behind them, word for word: the four old steps sit under the three icons they fold into.
 */
const STEPS = [
  {
    id: "invite",
    label: "Invite, build the card",
    icon: <LinkIcon size={22} />,
    tone: "theme-buyer",
    pal: "seller",
    detail: [
      "You invite the seller with their PayPal email and the listing link. They get a link to join.",
      "Seller Pal turns their photos into an item card with the serial or cert number on it.",
    ],
  },
  {
    id: "check",
    label: "Buyer Pal checks it",
    icon: <ShieldCheckIcon size={22} />,
    tone: "theme-buyer",
    pal: "buyer",
    detail: ["Buyer Pal checks the price, the cert and the chat. A refusal to use Pay Pals is a risk signal."],
  },
  {
    id: "lock",
    label: "Agree, lock, ship",
    icon: <BoxIcon size={22} />,
    tone: "theme-seller",
    pal: "seller",
    detail: ["Both agree, then the card locks into a PayPal Goods and Services order; packing photos, tracking and an arrival check follow."],
  },
] as const;

export function DealSteps() {
  const items: DeckItem[] = STEPS.map((s, i) => ({
    id: s.id,
    testId: `deal-step-${s.id}`,
    chipClass: `${s.tone} in-box w-full !items-start !gap-3 !rounded-2xl border-[var(--accent-line)] bg-surface !px-4 !py-3 text-left shadow-card`,
    chip: (
      <>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] ring-2 ring-[var(--accent)]">{s.icon}</span>
        <span className="flex flex-col">
          <span className="text-xs font-bold text-muted">Step {i + 1}</span>
          <span className="text-sm font-bold text-[var(--accent-ink)]">{s.label}</span>
        </span>
      </>
    ),
    detail: (
      <div className="flex items-start gap-3 text-sm leading-relaxed text-ink">
        <PalAvatar pal={s.pal} size={32} />
        <div className="space-y-1">
          {s.detail.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    ),
  }));
  return (
    <ChipDeck
      items={items}
      label="How a deal goes. Tap a step for the detail."
      className="mt-4 grid grid-cols-1 sm:grid-cols-3 [&>li]:flex"
      slotClassName="mt-3 rounded-2xl border border-line bg-wash p-4"
    />
  );
}
