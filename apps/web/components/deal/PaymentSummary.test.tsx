import { cleanPs5 } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaymentSummary } from "./PaymentSummary";

const fixturePayment = cleanPs5.payment!;

describe("PaymentSummary", () => {
  it("labels a fixture payment as an example with placeholder ids", () => {
    render(<PaymentSummary payment={fixturePayment} />);
    expect(screen.getByText("Example order id")).toBeInTheDocument();
    expect(screen.getByText("Example capture id")).toBeInTheDocument();
    expect(screen.getByText(/no PayPal order was created/)).toBeInTheDocument();
    expect(screen.getByText(fixturePayment.paypalOrderId)).toBeInTheDocument();
  });

  it("labels a real payment as the PayPal order", () => {
    render(<PaymentSummary payment={{ ...fixturePayment, paypalOrderId: "2NW245573K1279237", captureId: "9PC825472S929124S" }} />);
    expect(screen.getByText("PayPal order")).toBeInTheDocument();
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.queryByText(/Example/)).not.toBeInTheDocument();
  });
});
