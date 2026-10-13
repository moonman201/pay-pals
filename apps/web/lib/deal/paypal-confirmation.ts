/**
 * Which payment values came back from PayPal just now, and which ones only
 * Pay Pals holds. Pure: `planOrderRead` decides whether a live GET order is
 * worth trying, `readOrderFields` pulls the fields out of PayPal's response,
 * and `describeRead` writes the heading and the plain sentence that goes
 * with it.
 *
 * The rule the headings enforce: "Confirmed by PayPal" may only sit over
 * values that a live read returned in this render. A seeded example deal,
 * the mock gateway and a read that did not come back each get their own
 * heading saying what we actually have.
 */
import type { PaymentRecord } from "@pay-pals/contracts";

/** The fields of a PayPal order, as PayPal returned them. Strings as given, never reformatted from our record. */
export interface ConfirmedOrder {
  orderId: string;
  status: string;
  captureId: string | null;
  captureStatus: string | null;
  amount: string | null;
  currency: string | null;
  payeeEmail: string | null;
  /** PayPal's create_time and update_time on the order. */
  createTime: string | null;
  updateTime: string | null;
  /** custom_id exactly as PayPal holds it: the deal id and, after a "#", the history hash. */
  customId: string | null;
  /** The item line PayPal holds, which is the locked card's text. */
  itemName: string | null;
  itemDescription: string | null;
}

export type PayPalReadResult =
  /** A live GET order came back. These values are PayPal's. */
  | { kind: "confirmed"; order: ConfirmedOrder }
  /** A seeded example deal: the order id is a placeholder, so there is nothing at PayPal to read. */
  | { kind: "example" }
  /** The built-in mock gateway made these ids up; no order exists at PayPal. */
  | { kind: "mock" }
  /** There is a real order id, but the read did not come back. */
  | { kind: "failed" }
  /** No PayPal order has been created for this deal. */
  | { kind: "none" };

export type ReadPlan = { kind: "read"; orderId: string } | { kind: "skip"; result: PayPalReadResult };

/** A seeded scenario's placeholder order id. */
const FIXTURE_PREFIX = "FIXTURE-";
/** An id the in-process mock gateway invented. */
const MOCK_PREFIX = "DEMO-";

/** Neither prefix was ever sent to PayPal, so neither can be read back. */
export function isMadeUpOrderId(orderId: string): boolean {
  return orderId.startsWith(FIXTURE_PREFIX) || orderId.startsWith(MOCK_PREFIX);
}

/**
 * Whether to spend a live GET order on this payment. Only a real order id on
 * the sandbox gateway is worth reading; everything else is already known to
 * be ours and says so.
 */
export function planOrderRead(payment: PaymentRecord | null, payMode: "sandbox" | "mock"): ReadPlan {
  if (!payment) return { kind: "skip", result: { kind: "none" } };
  // The id itself says where it came from, whichever gateway is running now: a seeded
  // scenario's placeholder is an example deal even on a box with PayPal credentials.
  if (payment.paypalOrderId.startsWith(FIXTURE_PREFIX)) return { kind: "skip", result: { kind: "example" } };
  if (payment.paypalOrderId.startsWith(MOCK_PREFIX) || payMode === "mock") return { kind: "skip", result: { kind: "mock" } };
  return { kind: "read", orderId: payment.paypalOrderId };
}

type Json = Record<string, unknown>;

function asJson(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Pull the order fields out of PayPal's response. Nothing is invented: a field PayPal did not send stays null. */
export function readOrderFields(order: Json): ConfirmedOrder {
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  const unit = asJson(units[0]) ?? {};
  const amountSource = asJson(unit.amount) ?? {};
  const payments = asJson(unit.payments) ?? {};
  const captures = Array.isArray(payments.captures) ? payments.captures : [];
  const capture = asJson(captures[0]);
  const captureAmount = capture ? (asJson(capture.amount) ?? {}) : {};
  const payee = asJson(unit.payee) ?? {};
  const items = Array.isArray(unit.items) ? unit.items : [];
  const item = asJson(items[0]) ?? {};
  return {
    orderId: str(order.id) ?? "",
    status: str(order.status) ?? "",
    captureId: capture ? str(capture.id) : null,
    captureStatus: capture ? str(capture.status) : null,
    amount: str(captureAmount.value) ?? str(amountSource.value),
    currency: str(captureAmount.currency_code) ?? str(amountSource.currency_code),
    payeeEmail: str(payee.email_address),
    createTime: str(order.create_time),
    updateTime: str(order.update_time),
    customId: str(unit.custom_id),
    itemName: str(item.name),
    itemDescription: str(item.description),
  };
}

export interface ReadDescription {
  /** The heading over the values. Only ever "Confirmed by PayPal" for a live read. */
  heading: string;
  /** One plain sentence saying where the values under the heading came from. */
  note: string;
  /** True only when the values under the heading are PayPal's own, read in this render. */
  confirmed: boolean;
}

export const CONFIRMED_HEADING = "Confirmed by PayPal";
export const RECORDED_HEADING = "Recorded by Pay Pals";

/** The heading and the sentence under it, for whatever the read turned out to be. */
export function describeRead(result: PayPalReadResult): ReadDescription {
  switch (result.kind) {
    case "confirmed":
      return {
        heading: CONFIRMED_HEADING,
        note: "Read from PayPal's Orders API when this page loaded. These are PayPal's values, not ours.",
        confirmed: true,
      };
    case "example":
      return {
        heading: "Order ids recorded by Pay Pals, not confirmed by PayPal",
        note: "The ids below are placeholders: no PayPal order was created, so there is nothing to read back.",
        confirmed: false,
      };
    case "mock":
      return {
        heading: "Order ids recorded by Pay Pals, not confirmed by PayPal",
        note: "This deal ran without PayPal credentials, so Pay Pals made the order and capture ids up in memory. No order exists at PayPal.",
        confirmed: false,
      };
    case "failed":
      return {
        heading: "Order as Pay Pals recorded it, not read back from PayPal",
        note: "Pay Pals could not read this order back from PayPal just now. The values below are the ones Pay Pals stored at the time, so treat them as ours until the read works.",
        confirmed: false,
      };
    case "none":
      return {
        heading: "No PayPal order yet",
        note: "No PayPal order has been created for this deal.",
        confirmed: false,
      };
  }
}
