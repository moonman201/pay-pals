/**
 * Builds a Verdict for a demo scenario from its expectedVerdict. Required
 * flags are always raised. Optional flags are raised when the card or chat
 * shows the evidence for them. Explanations are plain sentences.
 */
import type { ItemCard, Message, RedFlag, RedFlagCode, RedFlagSeverity, ScenarioFixture, Verdict } from "@pay-pals/contracts";
import { nextFixtureCard } from "./fixture-match";
import { nowIso } from "./ids";

const FLAG_TEXT: Record<RedFlagCode, { severity: RedFlagSeverity; explanation: string }> = {
  FRIENDS_AND_FAMILY_REQUEST: { severity: "stop", explanation: "The seller asked for a Friends and Family payment, which has no buyer protection." },
  OFF_PLATFORM_PAYMENT: { severity: "stop", explanation: "The seller offered a payment method outside PayPal Goods and Services." },
  PRICE_FAR_BELOW_MARKET: { severity: "caution", explanation: "The asking price is far below what this item sells for." },
  URGENCY_PRESSURE: { severity: "caution", explanation: "The seller is pushing you to pay right now, which is a common scam pattern." },
  NAME_MISMATCH: { severity: "caution", explanation: "The PayPal account to be paid does not match the seller's name or email." },
  STOCK_OR_REUSED_PHOTO: { severity: "caution", explanation: "The listing photo looks like a product render, not a photo of this unit." },
  MISSING_SERIAL: { severity: "caution", explanation: "There is no serial number on the card, so the item cannot be matched on arrival." },
  SHIP_BEFORE_PAY_TRICK: { severity: "stop", explanation: "The seller is steering the order of payment and shipping in a way that removes your protection." },
  OTHER: { severity: "info", explanation: "Something else looked off. Read the evidence." },
};

type Detector = (card: ItemCard, chat: Message[], fixture: ScenarioFixture) => string | null;

function quote(chat: Message[], pattern: RegExp): string | null {
  const hit = chat.find((m) => m.author === "seller" && pattern.test(m.text));
  return hit ? `Seller wrote: "${hit.text}"` : null;
}

/** Evidence for each flag, read from the card and chat. Null means not found. */
const DETECTORS: Record<RedFlagCode, Detector> = {
  FRIENDS_AND_FAMILY_REQUEST: (_c, chat) => quote(chat, /friends\s*(and|&)\s*family/i),
  OFF_PLATFORM_PAYMENT: (_c, chat) => quote(chat, /zelle|cash\s*app|venmo me|wire|gift card/i),
  PRICE_FAR_BELOW_MARKET: (card, _chat, f) =>
    card.askingPrice < f.marketPrice.marketLow * 0.7
      ? `Asking $${card.askingPrice} against a market range of $${f.marketPrice.marketLow} to $${f.marketPrice.marketHigh}`
      : null,
  URGENCY_PRESSURE: (_c, chat) => quote(chat, /today|first to pay|tonight|other people asking/i),
  NAME_MISMATCH: (card, _chat, f) =>
    card.sellerPaypalEmail !== f.seller.email ? `Seller email ${f.seller.email}, PayPal account ${card.sellerPaypalEmail}` : null,
  STOCK_OR_REUSED_PHOTO: (card) => {
    const render = card.photos.find((p) => /white background|render|stock/i.test(p.whatItShows));
    return render ? `Photo: ${render.whatItShows}` : null;
  },
  MISSING_SERIAL: (card) => (card.serial === null ? "Card field serial: none" : null),
  SHIP_BEFORE_PAY_TRICK: (_c, chat) => quote(chat, /ship first|before you pay/i),
  OTHER: () => null,
};

function buildFlag(code: RedFlagCode, evidence: string): RedFlag {
  const text = FLAG_TEXT[code];
  return { code, severity: text.severity, evidence, explanation: text.explanation, raisedByRule: true };
}

export function flagsFromFixture(fixture: ScenarioFixture, card: ItemCard, chat: Message[]): RedFlag[] {
  const flags: RedFlag[] = [];
  for (const code of fixture.expectedVerdict.requiredFlags) {
    flags.push(buildFlag(code, DETECTORS[code](card, chat, fixture) ?? "Raised by the scenario rules"));
  }
  for (const code of fixture.expectedVerdict.optionalFlags) {
    const evidence = DETECTORS[code](card, chat, fixture);
    if (evidence) flags.push(buildFlag(code, evidence));
  }
  return flags;
}

/** What the Buyer Pal still wants: the photos the next card version adds. */
export function questionsFromFixture(fixture: ScenarioFixture, card: ItemCard): string[] {
  const next = nextFixtureCard(fixture, card);
  if (!next) return [];
  const have = new Set(card.photos.map((p) => p.url));
  return next.photos.filter((p) => !have.has(p.url)).map((p) => `Can you add a photo showing this: ${p.whatItShows}`);
}

function palMessageFor(overall: Verdict["overall"], flags: RedFlag[], questions: string[], card: ItemCard, fixture: ScenarioFixture): string {
  const price = `$${card.askingPrice} sits ${overall === "stop" ? "far under" : "inside"} the market range of $${fixture.marketPrice.marketLow} to $${fixture.marketPrice.marketHigh}.`;
  if (overall === "stop") {
    return `Stop. I found ${flags.length} problems with this deal. ${price} Pay Pals only moves money through a PayPal Goods and Services payment, so this deal ends here. You have not lost anything.`;
  }
  if (overall === "caution") {
    return `Careful. ${price} I raised ${flags.length} flags. Read them before you agree.`;
  }
  if (questions.length > 0) {
    return `This looks fair. ${price} The serial is on the card. Before you commit I want one more thing from the seller. I have asked for it.`;
  }
  return `This looks good. ${price} The serial is on the card and the PayPal account matches the seller. You can agree when you are ready.`;
}

export function verdictFromFixture(fixture: ScenarioFixture, card: ItemCard, chat: Message[]): Verdict {
  const flags = flagsFromFixture(fixture, card, chat);
  const questions = questionsFromFixture(fixture, card);
  const overall = fixture.expectedVerdict.overall;
  return {
    dealId: card.dealId,
    cardVersion: card.version,
    overall,
    flags,
    priceCheck: fixture.marketPrice,
    questionsForSeller: questions,
    palMessage: palMessageFor(overall, flags, questions, card, fixture),
    createdAt: nowIso(),
  };
}
