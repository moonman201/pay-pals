import { buildCustomId, emptyBox } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readOrderFields } from "@/lib/deal/paypal-confirmation";
import { PayPalConfirmation } from "./PayPalConfirmation";

const events = emptyBox.timeline;
const head = events[events.length - 1]!.hash;
const dealId = emptyBox.deal.id;
const payment = { ...emptyBox.payment!, paypalOrderId: "2NW245573K1279237" };

function liveOrder(customId: string | null) {
  return readOrderFields({
    id: "2NW245573K1279237",
    status: "COMPLETED",
    purchase_units: [customId ? { custom_id: customId } : {}],
  });
}

describe("PayPalConfirmation", () => {
  it("shows the hash PayPal carries on the order and that the stored events reproduce it", () => {
    const customId = buildCustomId(dealId, head);
    render(<PayPalConfirmation read={{ kind: "confirmed", order: liveOrder(customId) }} payment={payment} dealId={dealId} events={events} />);
    expect(screen.getByTestId("order-custom-id")).toHaveTextContent(customId);
    expect(screen.getByText(head)).toBeInTheDocument();
    expect(screen.getByTestId("history-badge")).toHaveTextContent("History unchanged since PayPal order");
    expect(screen.getByText(new RegExp(`reproduces from the ${events.length} events stored here`))).toBeInTheDocument();
  });

  it("warns when the stored events do not reproduce PayPal's hash", () => {
    render(<PayPalConfirmation read={{ kind: "confirmed", order: liveOrder(buildCustomId(dealId, "f".repeat(64))) }} payment={payment} dealId={dealId} events={events} />);
    expect(screen.getByRole("alert")).toHaveTextContent("History does not match the hash on the PayPal order");
    expect(screen.getByText(/does not reproduce/)).toBeInTheDocument();
  });

  it("says so plainly when PayPal's order carries a deal id and no hash", () => {
    render(<PayPalConfirmation read={{ kind: "confirmed", order: liveOrder(dealId) }} payment={payment} dealId={dealId} events={events} />);
    expect(screen.getByText(/but no history hash/)).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("shows no hash block at all without a live read, so nothing claims PayPal holds it", () => {
    for (const read of [{ kind: "example" }, { kind: "mock" }, { kind: "failed" }] as const) {
      const { unmount } = render(<PayPalConfirmation read={read} payment={payment} dealId={dealId} events={events} />);
      expect(screen.queryByTestId("order-history")).not.toBeInTheDocument();
      expect(screen.queryByTestId("order-custom-id")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows no hash block when PayPal returned no custom_id", () => {
    render(<PayPalConfirmation read={{ kind: "confirmed", order: liveOrder(null) }} payment={payment} dealId={dealId} events={events} />);
    expect(screen.queryByTestId("order-history")).not.toBeInTheDocument();
  });
});
