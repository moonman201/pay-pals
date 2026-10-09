import { cleanPs5 } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PayStep } from "./PayStep";

const lockedCard = cleanPs5.cards[1];
if (!lockedCard) throw new Error("fixture needs a locked card");

describe("PayStep", () => {
  const previous = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "sb-public-client-id";
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    else process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = previous;
  });

  it("renders the demo buttons when the server gateway is a mock, even with a public client id built in", () => {
    render(<PayStep dealId="d1" card={lockedCard} payMode="mock" onDone={() => {}} />);
    expect(screen.getByTestId("placeholder-pay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay with PayPal (demo)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay with Venmo (demo)" })).toBeInTheDocument();
    expect(screen.queryByText("Loading PayPal.")).not.toBeInTheDocument();
  });

  it("goes to the real SDK only when the server gateway is the sandbox", () => {
    render(<PayStep dealId="d1" card={lockedCard} payMode="sandbox" onDone={() => {}} />);
    expect(screen.queryByTestId("placeholder-pay")).not.toBeInTheDocument();
    expect(screen.getByText("Loading PayPal.")).toBeInTheDocument();
  });

  it("shows the sandbox test buyer with copy buttons when the server passes one, and never otherwise", () => {
    const { unmount } = render(<PayStep dealId="d1" card={lockedCard} payMode="sandbox" sandboxBuyer={{ email: "sb-buyer@personal.example.com", password: "sandbox-pass-123" }} onDone={() => {}} />);
    const note = screen.getByTestId("sandbox-buyer");
    expect(note).toHaveTextContent("PayPal sandbox test buyer, no real money");
    expect(note).toHaveTextContent("sb-buyer@personal.example.com");
    expect(note).toHaveTextContent("sandbox-pass-123");
    expect(note).toHaveTextContent("Press the PayPal button, sign in with this test account, and approve. Nothing is charged.");
    expect(screen.getByRole("button", { name: "Copy email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy password" })).toBeInTheDocument();
    unmount();
    render(<PayStep dealId="d1" card={lockedCard} payMode="sandbox" sandboxBuyer={null} onDone={() => {}} />);
    expect(screen.queryByTestId("sandbox-buyer")).not.toBeInTheDocument();
  });

  it("offers to capture an order the buyer approved elsewhere, labelled so the order of steps is clear", () => {
    const open = { ...cleanPs5.payment!, paypalOrderId: "2NW245573K1279237", status: "CREATED" as const, captureId: null, capturedAt: null };
    render(<PayStep dealId="d1" card={lockedCard} payMode="mock" payment={open} onDone={() => {}} />);
    expect(screen.getByTestId("capture-open")).toHaveTextContent("Order 2NW245573K1279237 is waiting for your approval in PayPal");
    expect(screen.getByRole("button", { name: "I approved in PayPal, capture now" })).toBeEnabled();
    render(<PayStep dealId="d2" card={lockedCard} payMode="mock" payment={{ ...open, status: "CAPTURED" }} onDone={() => {}} />);
    expect(screen.getAllByTestId("capture-open")).toHaveLength(1);
  });

  it("names the payee and the locked card in the intro", () => {
    render(<PayStep dealId="d1" card={lockedCard} payMode="mock" onDone={() => {}} />);
    expect(screen.getByText(new RegExp(lockedCard.sellerPaypalEmail.replace(".", "\\.")))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`serial ${lockedCard.serial}`))).toBeInTheDocument();
  });
});
