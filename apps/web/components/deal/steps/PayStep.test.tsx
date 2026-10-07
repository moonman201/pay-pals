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

  it("names the payee and the locked card in the intro", () => {
    render(<PayStep dealId="d1" card={lockedCard} payMode="mock" onDone={() => {}} />);
    expect(screen.getByText(new RegExp(lockedCard.sellerPaypalEmail.replace(".", "\\.")))).toBeInTheDocument();
    expect(screen.getByText(/serial AH912345678/)).toBeInTheDocument();
  });
});
