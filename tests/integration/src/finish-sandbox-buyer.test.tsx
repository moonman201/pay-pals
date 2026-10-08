/**
 * Branch finish: the "PayPal sandbox test buyer, no real money" note shows
 * on the pay panel only when the snapshot carries a sandbox buyer, which the
 * app grants to demo deals on the sandbox gateway alone. The default e2e
 * server runs demo-only (mock gateway), so the e2e asserts the absence; the
 * presence is checked here by rendering the pay step with the prop set.
 *
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanPs5 } from "@pay-pals/contracts";
import type { Deal } from "@pay-pals/contracts";
import { PayStep } from "@/components/deal/steps/PayStep";
import { sandboxBuyerFor } from "@/lib/deal/snapshot";

const NOTE = "PayPal sandbox test buyer, no real money";
const buyer = { email: "sb-buyer@personal.example.com", password: "not-a-real-password" };
const card = { ...cleanPs5.cards.at(-1)!, lockedAt: cleanPs5.cards.at(-1)!.lockedAt ?? new Date().toISOString() };

afterEach(() => cleanup());

describe("the sandbox buyer note on the pay step", () => {
  it("is absent without a sandbox buyer, as on the demo-only server", () => {
    render(<PayStep dealId={card.dealId} card={card} payMode="mock" sandboxBuyer={null} onDone={() => undefined} />);
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByTestId("sandbox-buyer")).toBeNull();
    expect(screen.getByRole("button", { name: "Pay with PayPal (demo)" })).toBeTruthy();
  });

  it("is present, with the account to copy, when the snapshot carries a sandbox buyer", () => {
    render(<PayStep dealId={card.dealId} card={card} payMode="sandbox" sandboxBuyer={buyer} onDone={() => undefined} />);
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByTestId("sandbox-buyer").textContent).toContain(buyer.email);
    expect(screen.getByRole("button", { name: "Copy email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy password" })).toBeTruthy();
    expect(screen.getByText(/Nothing is charged\./)).toBeTruthy();
  });

  it("shows the capture button for an order the buyer approved but has not captured", () => {
    const open = { ...cleanPs5.payment!, paypalOrderId: "5O190127TN364715T", captureId: null, status: "APPROVED" as const, capturedAt: null };
    render(<PayStep dealId={card.dealId} card={card} payMode="mock" payment={open} onDone={() => undefined} />);
    expect(screen.getByRole("button", { name: "I approved in PayPal, capture now" })).toBeTruthy();
  });
});

describe("who gets the sandbox buyer", () => {
  const demoDeal: Deal = cleanPs5.deal;
  const realDeal: Deal = { ...cleanPs5.deal, scenario: null };
  const sandbox = { modes: { store: "memory", claude: false, prices: "fixture", certs: "fixture", paypal: "sandbox" } as const, sandboxBuyer: buyer };
  const mock = { ...sandbox, modes: { ...sandbox.modes, paypal: "mock" as const } };

  it("a demo deal on the sandbox gateway", () => {
    expect(sandboxBuyerFor(demoDeal, sandbox)).toEqual(buyer);
  });

  it("never in demo-only mode (mock gateway), never on a real deal, never without the account", () => {
    expect(sandboxBuyerFor(demoDeal, mock)).toBeNull();
    expect(sandboxBuyerFor(realDeal, sandbox)).toBeNull();
    expect(sandboxBuyerFor(demoDeal, { ...sandbox, sandboxBuyer: null })).toBeNull();
  });
});
