import { cleanPs5 } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PayPalReadResult } from "@/lib/deal/paypal-confirmation";
import type { RecordedInput } from "@/lib/deal/recorded";
import { PaymentSummary } from "./PaymentSummary";

const fixturePayment = cleanPs5.payment!;

const record: RecordedInput = {
  cards: cleanPs5.cards,
  lockedVersion: cleanPs5.deal.lockedCardVersion ?? null,
  messages: [],
  verdicts: [],
  arrivalCheck: null,
  shipment: null,
  method: "paypal",
};

const confirmed: PayPalReadResult = {
  kind: "confirmed",
  order: {
    orderId: "2NW245573K1279237",
    status: "COMPLETED",
    captureId: "9PC825472S929124S",
    captureStatus: "COMPLETED",
    amount: "420.00",
    currency: "USD",
    payeeEmail: "seller@example.com",
    createTime: "2026-10-09T10:00:00Z",
    updateTime: "2026-10-09T10:05:00Z",
    customId: "deal-1",
    itemName: "PlayStation 5",
    itemDescription: null,
  },
};

describe("PaymentSummary", () => {
  it("shows the two halves, confirmed by PayPal and recorded by Pay Pals", () => {
    render(<PaymentSummary payment={{ ...fixturePayment, paypalOrderId: "2NW245573K1279237" }} read={confirmed} record={record} dealId={cleanPs5.deal.id} events={cleanPs5.timeline} />);
    expect(screen.getByRole("heading", { name: "Confirmed by PayPal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recorded by Pay Pals" })).toBeInTheDocument();
    expect(screen.getByText("2NW245573K1279237")).toBeInTheDocument();
    expect(screen.getByText("9PC825472S929124S")).toBeInTheDocument();
    expect(screen.getByTestId("paypal-confirmation")).toHaveAttribute("data-confirmed", "true");
  });

  it("never prints Confirmed by PayPal over a seeded example deal's placeholder ids", () => {
    render(<PaymentSummary payment={fixturePayment} read={{ kind: "example" }} record={record} dealId={cleanPs5.deal.id} events={cleanPs5.timeline} />);
    expect(screen.queryByRole("heading", { name: "Confirmed by PayPal" })).not.toBeInTheDocument();
    expect(screen.getByText("Example order id")).toBeInTheDocument();
    expect(screen.getByText(/placeholders: no PayPal order was created/)).toBeInTheDocument();
    expect(screen.getByText(fixturePayment.paypalOrderId)).toBeInTheDocument();
    expect(screen.getByTestId("paypal-confirmation")).toHaveAttribute("data-confirmed", "false");
  });

  it("says plainly that a failed read leaves only our own record", () => {
    render(<PaymentSummary payment={{ ...fixturePayment, paypalOrderId: "2NW245573K1279237" }} read={{ kind: "failed" }} record={record} dealId={cleanPs5.deal.id} events={cleanPs5.timeline} />);
    expect(screen.queryByRole("heading", { name: "Confirmed by PayPal" })).not.toBeInTheDocument();
    expect(screen.getByText(/could not read this order back from PayPal/)).toBeInTheDocument();
    expect(screen.getByTestId("paypal-confirmation")).toHaveAttribute("data-confirmed", "false");
  });
});
