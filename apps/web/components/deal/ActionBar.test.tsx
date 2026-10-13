import type { RedFlag, Verdict } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BLOCKED_SENTENCE, CAUTION_CHECKBOX, STOP_CHECKBOX } from "@/lib/deal/override";
import { ActionBar } from "./ActionBar";

type BarProps = Parameters<typeof ActionBar>[0];

function verdict(overall: Verdict["overall"], flags: RedFlag[] = []): Verdict {
  return { dealId: "d1", cardVersion: 1, overall, flags, priceCheck: null, questionsForSeller: [], palMessage: "m", createdAt: new Date().toISOString() };
}
const flag = (code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag => ({ code, severity, evidence: "e", explanation: "x", raisedByRule: true });
const AT = "2026-10-07T00:00:00.000Z";
const nobody = { buyerAgreedAt: null, sellerAgreedAt: null };

function renderBar(props: Partial<BarProps>) {
  const onAction = vi.fn();
  render(
    <ActionBar
      state="LISTED"
      role="buyer"
      verdict={null}
      dealId="d1"
      busy={null}
      hasLockedCard={false}
      agreement={nobody}
      cardVersion={1}
      cardChangedSinceAgree={false}
      onAction={onAction}
      {...props}
    />,
  );
  return onAction;
}

const buttonNames = () => screen.queryAllByRole("button").map((b) => b.textContent);

describe("ActionBar: buttons per state and role", () => {
  it("LISTED: buyer can review or cancel", () => {
    renderBar({ state: "LISTED", role: "buyer" });
    expect(buttonNames()).toEqual(["Ask my pal to review", "Cancel the deal"]);
  });

  it("LISTED seller sees only cancel and the waiting note", () => {
    renderBar({ state: "LISTED", role: "seller" });
    expect(buttonNames()).toEqual(["Cancel the deal"]);
    expect(screen.getByText(/Waiting for the buyer/)).toBeInTheDocument();
  });

  it("AGREED: buyer can pay, seller waits", () => {
    renderBar({ state: "AGREED", role: "buyer" });
    expect(buttonNames()).toEqual(["Pay", "Cancel the deal"]);
  });

  it("PAYMENT_PENDING with a locked card: no agree button, the pay panel is the next step", () => {
    renderBar({ state: "PAYMENT_PENDING", role: "buyer", hasLockedCard: true, agreement: { buyerAgreedAt: AT, sellerAgreedAt: AT }, cardVersion: 2 });
    expect(buttonNames()).toEqual(["Cancel the deal"]);
    expect(screen.queryByText(/Agree and lock the card/)).not.toBeInTheDocument();
  });

  it("PAID: seller marks shipped", () => {
    renderBar({ state: "PAID", role: "seller" });
    expect(buttonNames()).toEqual(["Mark as shipped"]);
  });

  it("PAID buyer can only report an issue, and is told to wait for the seller", () => {
    renderBar({ state: "PAID", role: "buyer" });
    expect(buttonNames()).toEqual(["Report an issue"]);
    expect(screen.getByText(/Waiting for the seller/)).toBeInTheDocument();
  });

  it("SHIPPED: buyer confirms delivery or reports an issue", () => {
    renderBar({ state: "SHIPPED", role: "buyer" });
    expect(buttonNames()).toEqual(["Confirm delivery", "Report an issue"]);
    expect(screen.queryByText(/Waiting for the seller/)).not.toBeInTheDocument();
  });

  it("DELIVERED: buyer completes or reports an issue", () => {
    renderBar({ state: "DELIVERED", role: "buyer" });
    expect(buttonNames()).toEqual(["Complete the deal", "Report an issue"]);
  });

  it("terminal states show no buttons and the ending", () => {
    renderBar({ state: "BLOCKED", role: "buyer" });
    expect(buttonNames()).toEqual([]);
    expect(screen.getByText(new RegExp(BLOCKED_SENTENCE.slice(0, 30)))).toBeInTheDocument();
  });

  it("offers the evidence pack link only when a pack exists", () => {
    renderBar({ state: "COMPLETE", role: "buyer", hasLockedCard: true, hasEvidence: false });
    expect(screen.queryByRole("link", { name: "Open the evidence pack" })).not.toBeInTheDocument();
  });

  it("links to the evidence pack once one is built", () => {
    renderBar({ state: "ISSUE", role: "buyer", hasLockedCard: true, hasEvidence: true });
    expect(screen.getByRole("link", { name: "Open the evidence pack" })).toHaveAttribute("href", "/deals/d1/evidence?as=buyer");
  });

  it("names the stage the pal is on while a review runs, so a long wait is not a frozen button", () => {
    renderBar({ state: "LISTED", role: "buyer", busy: "review" });
    expect(screen.getByRole("button", { name: "Working" })).toBeDisabled();
    expect(screen.getByTestId("working-status")).toHaveTextContent("Reading the chat");
  });


  it("calls onAction with the action id", async () => {
    const onAction = renderBar({ state: "LISTED", role: "buyer" });
    await userEvent.click(screen.getByRole("button", { name: "Ask my pal to review" }));
    expect(onAction).toHaveBeenCalledWith("review", { override: false });
  });
});

describe("ActionBar: invited deals", () => {
  it("INVITED buyer with nothing to review: only cancel, and a pointer to the seller's join page", () => {
    renderBar({ state: "INVITED", role: "buyer", cardVersion: 0 });
    expect(buttonNames()).toEqual(["Cancel the deal"]);
    expect(screen.getByText(/Waiting for the seller to join/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /seller's join page/ })).toHaveAttribute("href", "/deals/d1/join?as=seller");
  });

  it("INVITED buyer with a refusal to review: the review button, worded for the refusal", async () => {
    const onAction = renderBar({ state: "INVITED", role: "buyer", cardVersion: 0, refusalToReview: true });
    expect(buttonNames()).toEqual(["Ask my pal to review the refusal", "Cancel the deal"]);
    await userEvent.click(screen.getByRole("button", { name: "Ask my pal to review the refusal" }));
    expect(onAction).toHaveBeenCalledWith("review", { override: false });
  });

  it("INVITED seller: only cancel", () => {
    renderBar({ state: "INVITED", role: "seller", cardVersion: 0 });
    expect(buttonNames()).toEqual(["Cancel the deal"]);
  });

  it("REVIEWED with no card (a refusal that did not block) offers no agree", () => {
    renderBar({ state: "REVIEWED", role: "buyer", cardVersion: 0, verdict: verdict("caution", [flag("URGENCY_PRESSURE", "caution")]) });
    expect(buttonNames()).toEqual(["Cancel the deal"]);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the seller to join/)).toBeInTheDocument();
  });
});

describe("ActionBar: two-sided agreement", () => {
  it("REVIEWED seller sees Agree to this card", async () => {
    const onAction = renderBar({ state: "REVIEWED", role: "seller", verdict: verdict("go") });
    expect(buttonNames()).toEqual(["Agree to this card", "Cancel the deal"]);
    await userEvent.click(screen.getByRole("button", { name: "Agree to this card" }));
    expect(onAction).toHaveBeenCalledWith("agree", { override: false });
  });

  it("REVIEWED buyer sees Agree, or Agree and lock the card once the seller agreed", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("go") });
    expect(buttonNames()).toEqual(["Agree", "Cancel the deal"]);
  });

  it("buyer label changes when the seller has already agreed", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("go"), agreement: { buyerAgreedAt: null, sellerAgreedAt: AT } });
    expect(buttonNames()).toEqual(["Agree and lock the card", "Cancel the deal"]);
    expect(screen.getByText(/The seller has agreed to version 1/)).toBeInTheDocument();
  });

  it("a side that already agreed sees the waiting line instead of the button", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("go"), agreement: { buyerAgreedAt: AT, sellerAgreedAt: null } });
    expect(buttonNames()).toEqual(["Cancel the deal"]);
    expect(screen.getByText(/You agreed to version 1, waiting for the other side/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting for the seller/)).toBeInTheDocument();
  });

  it("says agree again when the card changed since this side agreed", () => {
    renderBar({ state: "REVIEWED", role: "seller", verdict: verdict("go"), cardVersion: 2, cardChangedSinceAgree: true });
    expect(screen.getByText(/Card changed since you agreed. Read version 2 and agree again/)).toBeInTheDocument();
    expect(buttonNames()).toEqual(["Agree to this card", "Cancel the deal"]);
  });

  it("the seller's agree is never gated by the buyer's flags", () => {
    renderBar({ state: "REVIEWED", role: "seller", verdict: verdict("stop", [flag("PRICE_FAR_BELOW_MARKET", "stop")]) });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agree to this card" })).toBeEnabled();
  });
});

describe("ActionBar: override rules", () => {
  it("go verdict: agree is enabled with no override control", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("go") });
    expect(screen.getByRole("button", { name: "Agree" })).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("caution flags: agree stays disabled until the buyer says they understand", async () => {
    const onAction = renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("caution", [flag("PRICE_FAR_BELOW_MARKET", "caution")]) });
    const agree = screen.getByRole("button", { name: "Agree" });
    expect(agree).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: CAUTION_CHECKBOX }));
    expect(agree).toBeEnabled();
    await userEvent.click(agree);
    expect(onAction).toHaveBeenCalledWith("agree", { override: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("non-payment stop: sterner warning, stricter checkbox label, still overridable", async () => {
    const onAction = renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("stop", [flag("PRICE_FAR_BELOW_MARKET", "stop"), flag("URGENCY_PRESSURE", "caution")]) });
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent(/Your pal says stop\. It found a price far below market\./);
    expect(warning).toHaveTextContent(/That is a risk signal, so ask the seller about it before you pay\./);
    expect(warning).toHaveTextContent(/Goods and Services protection/);
    const agree = screen.getByRole("button", { name: "Agree" });
    expect(agree).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: STOP_CHECKBOX }));
    expect(agree).toBeEnabled();
    await userEvent.click(agree);
    expect(onAction).toHaveBeenCalledWith("agree", { override: true });
  });

  it("payment-method flag: no override, no agree button, the plain sentence instead", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("stop", [flag("FRIENDS_AND_FAMILY_REQUEST", "stop"), flag("URGENCY_PRESSURE", "caution")]) });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agree/ })).not.toBeInTheDocument();
    expect(screen.getByText(BLOCKED_SENTENCE)).toBeInTheDocument();
  });
});
