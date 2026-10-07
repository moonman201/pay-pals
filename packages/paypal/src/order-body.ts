/**
 * Builds the Orders v2 request body for a locked item card. Pure: no network.
 * The payee is the seller's PayPal email, the one line item carries the
 * title, serial and condition, and custom_id and invoice_id are the deal id.
 */
import { CONDITION_LABELS, PAYPAL_LIMITS, isLocked, toPaypalAmount } from "@pay-pals/contracts";
import type { ItemCard } from "@pay-pals/contracts";

export class CardNotLockedError extends Error {
  constructor(public readonly dealId: string) {
    super(`Card for deal ${dealId} is not locked. Only a locked card can become a PayPal order.`);
    this.name = "CardNotLockedError";
  }
}

/** Cuts text to a PayPal field limit, marking the cut with "...". */
export function trimTo(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}

/** "Serial 7LP045912. Condition: Good. Light scuff..." within the item description limit. */
export function describeCard(card: ItemCard): string {
  const serial = card.serial ? `Serial ${card.serial}.` : "Serial not provided.";
  const condition = `Condition: ${CONDITION_LABELS[card.conditionGrade]}.`;
  const notes = card.conditionNotes.trim();
  return trimTo([serial, condition, notes].filter(Boolean).join(" "), PAYPAL_LIMITS.itemDescription);
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

export function buildOrderBody(card: ItemCard, dealId: string): OrderBody {
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
        custom_id: trimTo(dealId, PAYPAL_LIMITS.customId),
        invoice_id: trimTo(dealId, PAYPAL_LIMITS.invoiceId),
        description: trimTo(card.title, PAYPAL_LIMITS.purchaseUnitDescription),
        payee: { email_address: card.sellerPaypalEmail },
        amount: { ...money, breakdown: { item_total: money } },
        items: [item],
      },
    ],
  };
}
