/**
 * One status view per deal: five groups, and every line in them carries one
 * of exactly four labels.
 *
 *   Verified   Pay Pals checked this against something, and it matched. The
 *              detail always names what it was checked against.
 *   Flagged    Pay Pals checked it and it did not match.
 *   Unverified Pay Pals holds it, but nothing has been checked against it.
 *   Missing    It is not on record at all.
 *
 * Flagged used to be folded into Unverified, which gave "we looked and it is
 * wrong" and "we never looked" the same word, so the lines a buyer most needs
 * to see read like the ones carrying no news. Splitting them is the whole of
 * Matt's Oct 11 note on this view.
 *
 * Verified never means the item is genuine or that the seller owns it. Every
 * line is derived from data the deal already carries; nothing here calls out.
 *
 * Length: over the 300-line smell threshold, and deliberately one file. Most
 * of it is the exact sentence each line prints, and the whole point of the
 * view is that the five groups and the three labels are decided in one place
 * where they can be read against each other. Splitting it by group would put
 * the wording rules in five files and the shared helpers in a sixth.
 */
import type { ArrivalCheck, Deal, DealEvent, ItemCard, PaymentRecord, Shipment, Verdict } from "@pay-pals/contracts";
import { formatMoney, formatTime } from "../format";
import { ASK_FOR_A_CLEARER_PHOTO, CLAIMS_NEITHER, outcomeOf, unsettledOf } from "./arrival-outcome";
import { boxSerialStatus } from "./box-serial";
import { checkOrderHistory } from "./order-history";
import { FLAG_WORDS } from "./override";
import { couldNotVerify } from "./pal-reasons";
import type { PayPalReadResult } from "./paypal-confirmation";

export type StatusLabel = "verified" | "flagged" | "unverified" | "missing";

export const STATUS_WORDS: Readonly<Record<StatusLabel, string>> = {
  verified: "Verified",
  flagged: "Flagged",
  unverified: "Unverified",
  missing: "Missing",
};

/** The sentence that has to sit above the view, so "Verified" is never read as a claim about the item. Matt's words. */
export const STATUS_LEGEND =
  "Verified: checked and matched. Flagged: checked and didn't match. Unverified: on file, not checked. Missing: not on record. Verified never means genuine or that the seller owns it.";

export interface StatusItem {
  id: string;
  /** What the line is about. */
  label: string;
  status: StatusLabel;
  /** What it was checked against, or what we hold and what has not been checked. */
  detail: string;
}

export type StatusGroupId = "card" | "evidence" | "payment" | "shipping" | "delivery";

/**
 * A pointer to the panel that already says this at length, so the view can
 * drop a row instead of printing the same sentence twice (Matt's rule 1:
 * say each fact once, and link rather than restate).
 */
export interface StatusNote {
  text: string;
  href: string;
  linkText: string;
}

export interface StatusGroup {
  id: StatusGroupId;
  title: string;
  items: StatusItem[];
  note?: StatusNote;
}

export interface StatusInput {
  deal: Deal;
  cards: readonly ItemCard[];
  lockedCard: ItemCard | null;
  verdicts: readonly Verdict[];
  arrivalCheck: ArrivalCheck | null;
  payment: PaymentRecord | null;
  paypalRead: PayPalReadResult;
  shipment: Shipment | null;
  events: readonly DealEvent[];
  hasEvidence: boolean;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The newest review, which is the one the page is acting on. */
function latest(verdicts: readonly Verdict[]): Verdict | null {
  return verdicts.length > 0 ? (verdicts[verdicts.length - 1] ?? null) : null;
}

/** The card the view talks about: the locked one if there is one, otherwise the newest. */
function subjectCard(input: StatusInput): ItemCard | null {
  return input.lockedCard ?? input.cards[input.cards.length - 1] ?? null;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Why a line could not be confirmed, in the view's own words. The payment
 * panel says the same thing at more length; this stays short so the view
 * reads as a list and the phrase is not printed twice on one page.
 */
function whyNotConfirmed(read: PayPalReadResult): string {
  switch (read.kind) {
    case "example":
      return "This is a seeded example deal, so that id is a placeholder with nothing behind it at PayPal.";
    case "mock":
      return "This deal ran without PayPal credentials, so Pay Pals invented that id in memory.";
    case "failed":
      return "The live read of the order did not come back, so nothing here is a value PayPal returned.";
    case "none":
      return "No PayPal order exists for this deal.";
    case "confirmed":
      return "";
  }
}

// ---------------------------------------------------------------- the card

function cardGroup(input: StatusInput): StatusGroup {
  const { deal } = input;
  const card = subjectCard(input);
  const items: StatusItem[] = [];

  if (input.lockedCard) {
    items.push({
      id: "card-locked",
      label: "Item card locked",
      status: "verified",
      detail: `Version ${input.lockedCard.version}, locked ${input.lockedCard.lockedAt ? formatTime(input.lockedCard.lockedAt) : "at agreement"}. Pay Pals locks a card only after both sides have agreed to that same version, which is what it checked.`,
    });
  } else if (card) {
    items.push({
      id: "card-locked",
      label: "Item card locked",
      status: "unverified",
      // Matt: "Not yet", because a card nobody has locked is a step not reached, not a fault.
      detail: `Not yet. Version ${card.version} is still open to change, so nothing has been locked or checked against it.`,
    });
  } else {
    items.push({ id: "card-locked", label: "Item card locked", status: "missing", detail: "No item card on this deal." });
  }

  const buyer = deal.buyerAgreedAt;
  const seller = deal.sellerAgreedAt;
  if (buyer && seller) {
    items.push({
      id: "both-agreed",
      label: "Both sides agreed to the same version",
      status: "verified",
      detail: `Buyer agreed ${formatTime(buyer)}, seller agreed ${formatTime(seller)}. Pay Pals compared the two: both are against card version ${deal.lockedCardVersion ?? deal.currentCardVersion}. A new version clears both agreements.`,
    });
  } else if (buyer || seller) {
    items.push({
      id: "both-agreed",
      label: "Both sides agreed to the same version",
      status: "unverified",
      detail: `${buyer ? "The buyer" : "The seller"} agreed ${formatTime((buyer ?? seller)!)}. The other side has not agreed to this version.`,
    });
  } else {
    items.push({ id: "both-agreed", label: "Both sides agreed to the same version", status: "missing", detail: "Neither side has agreed to a card version yet." });
  }

  items.push(cardOnOrderItem(input));
  return { id: "card", title: "The agreed item card", items };
}

function cardOnOrderItem(input: StatusInput): StatusItem {
  const id = "card-on-order";
  const label = "Card text on the PayPal order";
  const card = input.lockedCard;
  if (input.paypalRead.kind !== "confirmed") {
    if (!input.payment) return { id, label, status: "missing", detail: "No PayPal order was created, so the card text is not on one." };
    return { id, label, status: "unverified", detail: `The order was not read back from PayPal, so the text it carries could not be compared with the card. ${whyNotConfirmed(input.paypalRead)}` };
  }
  const itemName = input.paypalRead.order.itemName;
  if (!itemName) return { id, label, status: "unverified", detail: "PayPal returned no item line on this order, so there is nothing to compare with the card." };
  if (!card) return { id, label, status: "unverified", detail: `PayPal's order carries the item line "${itemName}". No locked card is on record to compare it with.` };
  const matched = norm(itemName).includes(norm(card.title)) || norm(card.title).includes(norm(itemName));
  return {
    id,
    label,
    // Both texts are in hand and they are not the same text. That is a check that ran and failed.
    status: matched ? "verified" : "flagged",
    detail: matched
      ? `PayPal's own record of the order carries the item line "${itemName}". Pay Pals compared it with locked card version ${card.version}, "${card.title}": the same item.`
      : `PayPal's order carries the item line "${itemName}", and locked card version ${card.version} says "${card.title}". Those are not the same text.`,
  };
}

// ------------------------------------------------------------- the evidence

function serialItem(input: StatusInput): StatusItem {
  const id = "serial";
  const label = "Serial number on the card";
  const card = subjectCard(input);
  // Matt: the row stays, because some cards do carry a serial, and its absence is itself worth seeing.
  if (!card || (!card.serial && !card.boxSerial)) return { id, label, status: "missing", detail: "None on this card." };
  const status = boxSerialStatus(card);
  if (status === "match") {
    return {
      id,
      label,
      status: "verified",
      detail: `Card serial ${card.serial} compared with ${card.boxSerial}, the number the seller photographed on the box: the same number. A matching serial supports the listing. It is not a check of ownership and not a check that the item is genuine.`,
    };
  }
  if (status === "mismatch") {
    return { id, label, status: "flagged", detail: `The card says serial ${card.serial} and the box label says ${card.boxSerial}. Those are different numbers.` };
  }
  if (card.serial) return { id, label, status: "unverified", detail: `Serial ${card.serial} is on the card. Nothing has been compared with it.` };
  return { id, label, status: "unverified", detail: `Box label ${card.boxSerial} is on the card, but no serial has been read off the item itself, so there is nothing to compare.` };
}

function certItem(input: StatusInput): StatusItem | null {
  const card = subjectCard(input);
  if (!card?.certNumber) return null;
  const id = "cert";
  const label = "Certificate number on the card";
  const check = latest(input.verdicts)?.certCheck ?? null;
  if (!check) return { id, label, status: "unverified", detail: `Cert ${card.certNumber} is on the card. No check against a grader record is on file.` };
  const provider = check.record.provider === "psa" ? "PSA's record" : "the demo grader record";
  if (check.matches === true) {
    const parts = [check.record.subject, check.record.grade].filter(Boolean).join(", ");
    return {
      id,
      label,
      status: "verified",
      detail: `Cert ${check.record.certNumber} compared with ${provider}${parts ? ` (${parts})` : ""}: the record describes the card on the item card. A matching cert supports the listing. It is not a check that the slab is genuine or that the seller owns it.`,
    };
  }
  if (check.matches === false) return { id, label, status: "flagged", detail: `Cert ${check.record.certNumber} compared with ${provider}: ${check.explanation}` };
  return { id, label, status: "unverified", detail: `Cert ${check.record.certNumber} was not checked. ${check.explanation}` };
}

function photoItem(input: StatusInput): StatusItem {
  const id = "photos";
  const label = "Photos on the item card";
  const urls = new Set<string>();
  for (const card of input.cards) for (const photo of card.photos) urls.add(photo.url);
  if (urls.size === 0) return { id, label, status: "missing", detail: "No photos on the item card." };
  const flagged = latest(input.verdicts)?.flags.some((f) => f.code === "STOCK_OR_REUSED_PHOTO") ?? false;
  return {
    id,
    label,
    status: flagged ? "flagged" : "unverified",
    detail: flagged
      ? // "Already on file" is the honest half: the match is against Pay Pals' own
        // reference folder, which holds the listing photos, never a search of the web.
        `${plural(urls.size, "photo", "photos")} stored with the card. One matches a listing photo already on file, so it was not taken of this seller's item for this listing.`
      : `${plural(urls.size, "photo", "photos")} stored with the card. Pay Pals keeps them with the deal and shows both sides the same ones. It compares them against its own set of pictures and nothing else.`,
  };
}

/**
 * What the Buyer Pal's name check concluded, which until now was shown only
 * when it failed: a pass left no trace anywhere on the page.
 *
 * Read off the verdict, never recomputed here. packages/agents owns the
 * comparison (rules/name-mismatch.ts) and raises NAME_MISMATCH when the
 * PayPal address does not share a name token with the seller. apps/web
 * passes the seller on every review, so for any verdict the rule ran, and
 * the absence of the flag is its pass. Decision 15: the side that decides a
 * fact is the side that words it.
 */
function payeeNameItem(input: StatusInput): StatusItem | null {
  const id = "payee-name";
  const label = "PayPal address against the seller's name";
  const card = subjectCard(input);
  const verdict = latest(input.verdicts);
  if (!card || !verdict) return null;
  const flag = verdict.flags.find((f) => f.code === "NAME_MISMATCH");
  const { seller } = input.deal;
  if (flag) {
    // The flag's evidence normally names both sides. When it does not, say what was compared.
    const compared = flag.evidence.includes(card.sellerPaypalEmail) ? "" : `The Buyer Pal compared ${card.sellerPaypalEmail} with ${seller.displayName}, the seller on this deal. `;
    return { id, label, status: "flagged", detail: `${compared}${flag.explanation} ${flag.evidence}` };
  }
  // The pal says this itself when it was handed no seller to compare against.
  const undecided = couldNotVerify(verdict.reasoning).find((line) => /seller's name on the account/i.test(line));
  if (undecided) {
    const reason = /only initials/i.test(undecided) ? "The seller's name is only initials" : "The Buyer Pal was not given the seller's name";
    return { id, label, status: "unverified", detail: `${reason}, so it could not check it against ${card.sellerPaypalEmail}.` };
  }
  const compared = `The Buyer Pal compared ${card.sellerPaypalEmail} with ${seller.displayName}, the seller on this deal, and raised no flag.`;
  const local = (card.sellerPaypalEmail.split("@")[0] ?? "").toLowerCase();
  const nameInAddress = seller.displayName
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((token) => token.length >= 3 && local.includes(token));
  const why = nameInAddress
    ? "The address contains part of the seller's name."
    : card.sellerPaypalEmail.toLowerCase() === seller.email.toLowerCase()
      ? "The seller's name does not appear in the address. It is the contact email they gave, so the address was not checked against the name."
      : "The seller's name does not appear in the address.";
  return { id, label, status: "verified", detail: `${compared} ${why} This is not proof of who owns the account.` };
}

/**
 * What the view used to add here and no longer does: one row per thing the
 * pal could not check, one per open question, and one per flag. All three
 * are printed in full by the review panel above, so the view was saying the
 * same sentences a second time, and they were the bulk of its length.
 *
 * They are not deleted, they are upstairs. This counts them and points at
 * them (Matt's rule 1), which is also the only honest way to shorten a view
 * whose job is to be complete.
 */
function reviewNote(verdict: Verdict | null): StatusNote | null {
  if (!verdict) return null;
  const parts: string[] = [];
  const open = couldNotVerify(verdict.reasoning).length;
  const asked = verdict.questionsForSeller.length;
  const flags = verdict.flags.filter((f) => f.severity !== "info").length;
  if (flags > 0) parts.push(plural(flags, "flag", "flags"));
  if (open > 0) parts.push(`${open} it could not check`);
  if (asked > 0) parts.push(plural(asked, "open question", "open questions"));
  if (parts.length === 0) return null;
  return {
    text: `The Buyer Pal raised ${list(parts)} on card version ${verdict.cardVersion}.`,
    href: "#buyer-pal-review",
    linkText: "Read them in the review",
  };
}

function evidenceGroup(input: StatusInput): StatusGroup {
  const items: StatusItem[] = [serialItem(input)];
  const cert = certItem(input);
  if (cert) items.push(cert);
  items.push(photoItem(input));
  const payee = payeeNameItem(input);
  if (payee) items.push(payee);

  const note = reviewNote(latest(input.verdicts));
  return { id: "evidence", title: "Evidence the pals asked for", items, ...(note ? { note } : {}) };
}

// --------------------------------------------------------------- the payment

/**
 * The group's own title is a claim, so it carries the same rule as the
 * lines: it says "confirmed by PayPal" only when a live read confirmed
 * something.
 */
function paymentTitle(items: readonly StatusItem[]): string {
  return items.some((i) => i.status === "verified") ? "Payment confirmed by PayPal" : "Payment, not confirmed by PayPal";
}

/** Decision 12: the buyer took the payment off Pay Pals, so there is nothing of PayPal's to show. */
function offPlatformItem(input: StatusInput): StatusItem | null {
  const chosen = input.events.find((e) => e.kind === "off_platform_chosen");
  if (!chosen) return null;
  return {
    id: "off-platform",
    label: "Paid outside PayPal Goods and Services",
    status: "missing",
    detail: `The buyer told Pay Pals on ${formatTime(chosen.at)} that they would pay another way. Pay Pals created no order, is not handling that payment and has no record of it, so there is no PayPal protection and no dispute path for it.`,
  };
}

function paymentGroup(input: StatusInput): StatusGroup {
  const items: StatusItem[] = [];
  const read = input.paypalRead;
  const why = whyNotConfirmed(read);
  const offPlatform = offPlatformItem(input);
  if (offPlatform) items.push(offPlatform);

  if (!input.payment) {
    items.push({ id: "order", label: "Order at PayPal", status: "missing", detail: "No PayPal order has been created for this deal." });
    items.push({ id: "capture", label: "Capture at PayPal", status: "missing", detail: "No money has moved." });
    return { id: "payment", title: paymentTitle(items), items };
  }
  const payment = input.payment;

  if (read.kind === "confirmed") {
    items.push({
      id: "order",
      label: "Order at PayPal",
      status: "verified",
      detail: `Order ${read.order.orderId}, status ${read.order.status || "not stated"}, read back from PayPal's Orders API when this page loaded.`,
    });
    items.push(
      read.order.captureId
        ? {
            id: "capture",
            label: "Capture at PayPal",
            status: "verified",
            detail: `Capture ${read.order.captureId}, status ${read.order.captureStatus ?? "not stated"}, ${[read.order.amount, read.order.currency].filter(Boolean).join(" ") || "amount not stated"}, read from PayPal's record of the order.`,
          }
        : { id: "capture", label: "Capture at PayPal", status: "unverified", detail: "PayPal's record of this order carries no capture yet, so no money has been taken." },
    );
    items.push(amountAndPayeeItem(input, read));
    items.push(hashItem(input, read));
    return { id: "payment", title: paymentTitle(items), items };
  }

  items.push({ id: "order", label: "Order at PayPal", status: "unverified", detail: `Pay Pals recorded order ${payment.paypalOrderId}, status ${payment.status.toLowerCase()}. ${why}` });
  items.push({
    id: "capture",
    label: "Capture at PayPal",
    status: "unverified",
    detail: payment.captureId ? `Pay Pals recorded capture ${payment.captureId}. ${why}` : "Pay Pals has no capture on record for this order.",
  });
  items.push(amountAndPayeeItem(input, read));
  items.push(hashItem(input, read));
  return { id: "payment", title: paymentTitle(items), items };
}

function amountAndPayeeItem(input: StatusInput, read: PayPalReadResult): StatusItem {
  const id = "amount-payee";
  const label = "Amount and payee match the locked card";
  const card = input.lockedCard;
  if (!card) return { id, label, status: "missing", detail: "No locked card to compare the order with." };
  const want = `${formatMoney(card.askingPrice, card.currency)} to ${card.sellerPaypalEmail}`;
  if (read.kind !== "confirmed") {
    return { id, label, status: "unverified", detail: `Locked card version ${card.version} says ${want}. The order was not read back from PayPal, so there is nothing of PayPal's to compare it with.` };
  }
  const amountOk = read.order.amount !== null && Math.abs(Number(read.order.amount) - card.askingPrice) < 0.005;
  const payeeOk = read.order.payeeEmail !== null && read.order.payeeEmail.toLowerCase() === card.sellerPaypalEmail.toLowerCase();
  const got = `${read.order.amount ?? "no amount"} ${read.order.currency ?? ""} to ${read.order.payeeEmail ?? "no payee"}`.replace(/\s+/g, " ");
  if (amountOk && payeeOk) return { id, label, status: "verified", detail: `PayPal's order says ${got}. Pay Pals compared it with locked card version ${card.version}, which says ${want}: both agree.` };
  const wrong = list([amountOk ? null : "the amount", payeeOk ? null : "the payee"].filter((x): x is string => x !== null));
  return { id, label, status: "flagged", detail: `PayPal's order says ${got} and locked card version ${card.version} says ${want}. ${wrong} does not agree.` };
}

function hashItem(input: StatusInput, read: PayPalReadResult): StatusItem {
  const id = "history-hash";
  const label = "Deal history hash in PayPal's record";
  if (read.kind !== "confirmed") {
    return {
      id,
      label,
      status: "unverified",
      detail: input.payment?.historyHash
        ? `Pay Pals recorded a chain head with the order. Without a live read of the order, the copy PayPal holds cannot be compared with the ${plural(input.events.length, "stored event", "stored events")}.`
        : "No chain head is recorded with this order.",
    };
  }
  const check = checkOrderHistory(read.order.customId, input.deal.id, input.events);
  if (!check || check.historyHash === null) return { id, label, status: "missing", detail: "PayPal's record of this order carries no history hash." };
  return {
    id,
    label,
    status: check.matches ? "verified" : "flagged",
    detail: check.matches
      ? `The hash in PayPal's custom_id on order ${read.order.orderId} reproduces from the ${plural(check.events, "event", "events")} stored here, so the timeline has not changed since the order was created.`
      : `The hash in PayPal's custom_id on order ${read.order.orderId} does not reproduce from the ${plural(check.events, "event", "events")} stored here.`,
  };
}

// -------------------------------------------------------------- the shipment

function shippingGroup(input: StatusInput): StatusGroup {
  const items: StatusItem[] = [];
  const shipment = input.shipment;
  if (!shipment) {
    items.push({ id: "tracking", label: "Carrier and tracking number", status: "missing", detail: "Nothing has been shipped." });
    items.push({ id: "packing-photos", label: "Packing photos", status: "missing", detail: "No packing photos on record." });
    return { id: "shipping", title: "Packing and shipping recorded", items };
  }

  items.push({
    id: "tracking",
    label: "Carrier and tracking number",
    status: "unverified",
    detail: `${shipment.carrier} ${shipment.trackingNumber}, shipped ${formatTime(shipment.shippedAt)}, as the seller entered it. Pay Pals does not query the carrier, so nothing has been checked against this number.`,
  });

  const photos = shipment.packingPhotos.length;
  const flags = shipment.flags;
  if (photos === 0) {
    items.push({
      id: "packing-photos",
      label: "Packing photos",
      status: "missing",
      detail: flags && flags.length > 0 ? `None. The Buyer Pal raised ${list(flags.map((f) => FLAG_WORDS[f.code]))} at ship time.` : "None. The seller shipped without photographing the packing.",
    });
  } else if (flags && flags.length === 0) {
    items.push({
      id: "packing-photos",
      label: "Packing photos",
      status: "verified",
      detail: `${plural(photos, "photo", "photos")}. The Buyer Pal compared them with the Seller Pal's packing checklist at ship time and found nothing missing.`,
    });
  } else if (flags && flags.length > 0) {
    items.push({
      id: "packing-photos",
      label: "Packing photos",
      status: "flagged",
      detail: `${plural(photos, "photo", "photos")}. The Buyer Pal checked them at ship time and raised ${list(flags.map((f) => FLAG_WORDS[f.code]))}.`,
    });
  } else {
    items.push({ id: "packing-photos", label: "Packing photos", status: "unverified", detail: `${plural(photos, "photo", "photos")} stored with the deal. No ship-time check is on record.` });
  }

  const required = shipment.checklist.filter((c) => c.required);
  if (required.length > 0) {
    const undone = required.filter((c) => !c.done);
    items.push({
      id: "checklist",
      label: "Seller Pal packing checklist",
      status: undone.length === 0 ? "verified" : "flagged",
      detail:
        undone.length === 0
          ? `All ${required.length} required steps were marked done when the seller shipped. Pay Pals compared the shipment against the checklist the Seller Pal wrote for this card.`
          : `${plural(undone.length, "required step", "required steps")} not done: ${list(undone.map((c) => c.label))}.`,
    });
  }
  return { id: "shipping", title: "Packing and shipping recorded", items };
}

// -------------------------------------------------------------- the delivery

/**
 * Where the serial on an arrival check came from, in the Buyer Pal's own
 * terms (Decision 15: one fact, one wording, not two ends describing it
 * differently).
 *
 *   photo       the pal read the number off the picture
 *   description the number came out of the caption, so it is the buyer's word
 *   absent      unknown, and nothing here may assume either
 */
function serialProvenance(check: ArrivalCheck): string {
  const serial = check.observed.serial;
  if (!serial) return "";
  switch (check.observed.serialSource) {
    case "photo":
      return ` Serial ${serial} was read off the picture of the item itself.`;
    case "description":
      return ` The serial ${serial} comes from the description filed with the photo, not from the picture, so it is the buyer's word and not a number the pal read.`;
    default:
      // No source on the check, so no claim either way, and not even the words to deny one:
      // the number is named and where it came from is left unsaid, because it is unknown.
      return ` The pal reports the serial as ${serial}. This check does not record where that number came from.`;
  }
}

function deliveryGroup(input: StatusInput): StatusGroup {
  const items: StatusItem[] = [];
  const deliveredAt = input.shipment?.deliveredAt ?? input.events.find((e) => e.kind === "delivered")?.at ?? null;
  items.push(
    deliveredAt
      ? {
          id: "delivered",
          label: "Delivery confirmed",
          status: "unverified",
          detail: `The buyer said the package arrived ${formatTime(deliveredAt)}. Pay Pals did not read a carrier scan, so this is the buyer's word and nothing was checked against it.`,
        }
      : { id: "delivered", label: "Delivery confirmed", status: "missing", detail: "Nobody has confirmed the package arrived." },
  );

  const check = input.arrivalCheck;
  if (!check) {
    items.push({ id: "arrival-check", label: "Arrival check against the locked card", status: "missing", detail: "No arrival check on record." });
  } else if (outcomeOf(check) === "match") {
    items.push({
      id: "arrival-check",
      label: "Arrival check against the locked card",
      status: "verified",
      detail: `The Buyer Pal compared the arrival photos against locked card version ${check.cardVersion} and found no difference from the item the card describes.${serialProvenance(check)}`,
    });
  } else if (outcomeOf(check) === "inconclusive") {
    /*
      Unverified, not Missing and certainly not a failure. The pal read both numbers and could
      not tell them apart, so "Pay Pals checked this and it matched" is false and "it did not
      match" is equally false. Unverified is exactly the label for a check that ran and did not
      settle, which the closed union already had.

      The old else branch mapped over `mismatches`, which is empty on an inconclusive check, so
      left alone it would have printed "found 0 differences:" and an empty list.
    */
    const open = unsettledOf(check);
    items.push({
      id: "arrival-check",
      label: "Arrival check against the locked card",
      status: "unverified",
      detail: `The Buyer Pal compared the arrival photos against locked card version ${check.cardVersion} and could not settle ${plural(open.length, "comparison", "comparisons")}: ${list(open.map((m) => `${m.field}, the card says ${m.expected} and the arrival shows ${m.observed}`))}. ${CLAIMS_NEITHER} ${ASK_FOR_A_CLEARER_PHOTO}`,
    });
  } else {
    items.push({
      id: "arrival-check",
      label: "Arrival check against the locked card",
      status: "flagged",
      detail: `The Buyer Pal compared the arrival photos with locked card version ${check.cardVersion} and found ${plural(check.mismatches.length, "difference", "differences")}: ${list(check.mismatches.map((m) => `${m.field}, card says ${m.expected}, arrived ${m.observed}`))}.`,
    });
  }

  items.push(
    input.hasEvidence
      ? {
          id: "evidence-pack",
          label: "Evidence pack",
          status: "unverified",
          detail:
            "Built from the locked card, the chat, the photos, the payment record, the tracking and the timeline. Useful context for a PayPal dispute. Nothing has checked the pack itself.",
        }
      : { id: "evidence-pack", label: "Evidence pack", status: "missing", detail: "No evidence pack has been built." },
  );
  // Same as the evidence group: the arrival panel prints these in full, so point at it.
  const open = couldNotVerify(check?.reasoning).length;
  const note: StatusNote | null =
    open > 0 ? { text: `The Buyer Pal named ${plural(open, "thing", "things")} it could not check on arrival.`, href: "#arrival-check", linkText: "Read them in the arrival check" } : null;
  return { id: "delivery", title: "Delivery, and the dispute-ready summary", items, ...(note ? { note } : {}) };
}

/** The five groups, in the order a reader should take them. */
export function dealStatusView(input: StatusInput): StatusGroup[] {
  return [cardGroup(input), evidenceGroup(input), paymentGroup(input), shippingGroup(input), deliveryGroup(input)];
}

/**
 * A stage nobody reached, written as one line instead of a list of Missing
 * rows that all say the same thing (Matt's rule 5).
 *
 * "Not reached" is deliberately not "nothing to report". A deal that was
 * blocked before payment and a deal still waiting to be paid are different
 * facts, and the second sentence says which this is, so collapsing the rows
 * loses the repetition and not the meaning.
 */
export interface SkippedStages {
  /** "payment, shipping and delivery". */
  names: string;
  /** Why none of them happened, in one short sentence. */
  because: string;
}

const STAGE_NAMES: Readonly<Record<StatusGroupId, string>> = {
  card: "the item card",
  evidence: "evidence",
  payment: "payment",
  shipping: "shipping",
  delivery: "delivery",
};

/**
 * True when nothing in the group has happened. Every line Missing is that
 * everywhere. On the card group an unlocked card also reads Unverified
 * ("Not yet", a step not reached), so that one line counts as untouched too.
 */
function untouched(group: StatusGroup): boolean {
  const idle = (item: StatusItem) => item.status === "missing" || (group.id === "card" && item.id === "card-locked" && item.status === "unverified");
  return group.items.length > 0 && group.items.every(idle);
}

/**
 * How far the deal's own state says it got. BLOCKED and CANCELLED say only
 * that it stopped, not where, so they claim nothing and let the rows decide.
 */
const REACHED: Readonly<Record<Deal["state"], number>> = {
  DRAFT: 0,
  INVITED: 0,
  LISTED: 0,
  REVIEWED: 0,
  AGREED: 0,
  BLOCKED: 0,
  CANCELLED: 0,
  PAYMENT_PENDING: 1,
  PAID: 1,
  SHIPPED: 2,
  DELIVERED: 3,
  ISSUE: 3,
  COMPLETE: 3,
};

/** The point on that scale each stage sits at. Earlier groups never collapse. */
const STAGE_AT: Readonly<Record<StatusGroupId, number>> = { card: 0, evidence: 0, payment: 1, shipping: 2, delivery: 3 };

/**
 * Splits the view into the groups worth reading and the trailing stages
 * nobody reached. Only a trailing run collapses: a gap in the middle is a
 * real oddity and stays on the page where it can be seen.
 *
 * A group collapses only when its rows are all Missing *and* the deal's own
 * state agrees it never got there. The state is a veto rather than the
 * decision, so a PAID deal carrying no payment rows keeps them on the page:
 * that combination is a fault worth seeing, and collapsing it would be the
 * view hiding exactly the thing it exists to show.
 */
export function splitUnreached(groups: readonly StatusGroup[], deal: Pick<Deal, "state">): { shown: StatusGroup[]; skipped: SkippedStages | null } {
  const shown = [...groups];
  const dropped: StatusGroup[] = [];
  const reached = REACHED[deal.state];
  const collapsible = (g: StatusGroup) => untouched(g) && reached < STAGE_AT[g.id];
  while (shown.length > 1 && collapsible(shown[shown.length - 1]!)) dropped.unshift(shown.pop()!);
  const blocked = deal.state === "BLOCKED" || deal.state === "CANCELLED";
  // A deal that ended can never agree a card it had not agreed, so the card
  // group is not "yet to come" but never reached, and it collapses from the
  // front as well. A deal still moving shows it normally.
  if (blocked && shown.length > 1 && shown[0]!.id === "card" && untouched(shown[0]!)) dropped.unshift(shown.shift()!);
  if (dropped.length === 0) return { shown, skipped: null };
  const first = STAGE_NAMES[dropped[0]!.id];
  return {
    shown,
    skipped: {
      names: list(dropped.map((g) => STAGE_NAMES[g.id])),
      because: blocked ? (dropped[0]!.id === "card" ? "This deal ended before the card was agreed, so no money moved." : `This deal ended before ${first}, so no money moved.`) : `This deal has not reached ${first} yet.`,
    },
  };
}

/** How many lines carry each label, for the header line above the view. */
export function countStatuses(groups: readonly StatusGroup[]): Record<StatusLabel, number> {
  const counts: Record<StatusLabel, number> = { verified: 0, flagged: 0, unverified: 0, missing: 0 };
  for (const group of groups) for (const item of group.items) counts[item.status] += 1;
  return counts;
}
