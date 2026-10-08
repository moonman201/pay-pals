/**
 * Builds the Orders v2 request body for a locked item card. Pure: no network.
 * The payee is the seller's PayPal email, the one line item carries the
 * title, serial and condition, and custom_id and invoice_id are the deal id.
 */
import { CONDITION_LABELS, PAYPAL_LIMITS, buildCustomId, isLocked, toPaypalAmount } from "@pay-pals/contracts";
import type { ItemCard } from "@pay-pals/contracts";

export class CardNotLockedError extends Error {
  constructor(public readonly dealId: string) {
    super(`Card for deal ${dealId} is not locked. Only a locked card can become a PayPal order.`);
    this.name = "CardNotLockedError";
  }
}

export const ELLIPSIS = "...";

/**
 * Cuts text to a PayPal field limit at the last word boundary that fits,
 * ending with an ellipsis, so PayPal's record never shows half a word. A
 * single word longer than the limit is cut hard; the result never exceeds
 * the limit.
 */
export function trimTo(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const budget = limit - ELLIPSIS.length;
  if (budget <= 0) return text.slice(0, limit);
  const head = text.slice(0, budget + 1);
  const lastSpace = head.lastIndexOf(" ");
  const kept = lastSpace > 0 ? head.slice(0, lastSpace) : text.slice(0, budget);
  return `${kept.replace(/[\s,;:.]+$/, "")}${ELLIPSIS}`;
}

/**
 * "Serial AH912345678. Condition: Good. Owned from new..." within the item
 * description limit. The serial and condition are the proof, so they are
 * never trimmed: only the notes give way, at a word boundary.
 */
export function describeCard(card: ItemCard): string {
  const serial = card.serial ? `Serial ${card.serial}.` : "Serial not provided.";
  const condition = `Condition: ${CONDITION_LABELS[card.conditionGrade]}.`;
  const lead = `${serial} ${condition}`;
  const notes = card.conditionNotes.trim();
  const room = PAYPAL_LIMITS.itemDescription - lead.length - 1;
  if (!notes || room < ELLIPSIS.length + 2) return lead;
  return `${lead} ${trimTo(notes, room)}`;
}

export interface OrderItem {
  name: string;
  description: string;
  sku?: string;
  unit_amount: { currency_code: string; value: string };
  quantity: "1";
  category: "PHYSICAL_GOODS";
}

export interface OrderBody {
  intent: "CAPTURE";
  purchase_units: [
    {
      reference_id: string;
      custom_id: string;
      invoice_id: string;
      description: string;
      payee: { email_address: string };
      amount: {
        currency_code: string;
        value: string;
        breakdown: { item_total: { currency_code: string; value: string } };
      };
      items: [OrderItem];
    },
  ];
}

/**
 * historyHash is the head of the deal's event chain at order time. It rides
 * in custom_id as "dealId#hash" so PayPal's own record proves the history;
 * invoice_id stays the bare deal id.
 */
export function buildOrderBody(card: ItemCard, dealId: string, historyHash?: string | null): OrderBody {
  if (!isLocked(card)) throw new CardNotLockedError(dealId);
  const value = toPaypalAmount(card.askingPrice);
  const money = { currency_code: card.currency, value };
  const item: OrderItem = {
    name: trimTo(card.title, PAYPAL_LIMITS.itemName),
    description: describeCard(card),
    unit_amount: money,
    quantity: "1",
    category: "PHYSICAL_GOODS",
  };
  if (card.serial) item.sku = trimTo(card.serial, PAYPAL_LIMITS.itemSku);
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: trimTo(`deal-${dealId}-v${card.version}`, PAYPAL_LIMITS.customId),
        custom_id: trimTo(buildCustomId(dealId, historyHash), PAYPAL_LIMITS.customId),
        invoice_id: trimTo(dealId, PAYPAL_LIMITS.invoiceId),
        description: trimTo(card.title, PAYPAL_LIMITS.purchaseUnitDescription),
        payee: { email_address: card.sellerPaypalEmail },
        amount: { ...money, breakdown: { item_total: money } },
        items: [item],
      },
    ],
  };
}
