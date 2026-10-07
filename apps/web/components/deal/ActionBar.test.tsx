import type { RedFlag, Verdict } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BLOCKED_SENTENCE } from "@/lib/deal/override";
import { ActionBar } from "./ActionBar";

type BarProps = Parameters<typeof ActionBar>[0];

function verdict(overall: Verdict["overall"], flags: RedFlag[] = []): Verdict {
  return { dealId: "d1", cardVersion: 1, overall, flags, priceCheck: null, questionsForSeller: [], palMessage: "m", createdAt: new Date().toISOString() };
}
const flag = (code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag => ({ code, severity, evidence: "e", explanation: "x", raisedByRule: true });

function renderBar(props: Partial<BarProps>) {
  const onAction = vi.fn();
  render(<ActionBar state="LISTED" role="buyer" verdict={null} dealId="d1" busy={null} hasLockedCard={false} onAction={onAction} {...props} />);
  return onAction;
}

const buttonNames = () => screen.queryAllByRole("button").map((b) => b.textContent);

describe("ActionBar: buttons per state and role", () => {
  it("LISTED: buyer can review or cancel, seller only cancel and is told to wait", () => {
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

  it("PAID: seller marks shipped, buyer cannot cancel", () => {
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

  it("says the pal is thinking while a review runs", () => {
    renderBar({ state: "LISTED", role: "buyer", busy: "review" });
    expect(screen.getByRole("button", { name: "Working" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/reading the chat and checking prices/);
  });

  it("calls onAction with the action id", async () => {
    const onAction = renderBar({ state: "LISTED", role: "buyer" });
    await userEvent.click(screen.getByRole("button", { name: "Ask my pal to review" }));
    expect(onAction).toHaveBeenCalledWith("review", { override: false });
  });
});

describe("ActionBar: override rules", () => {
  it("go verdict: agree is enabled with no override control", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("go") });
    expect(screen.getByRole("button", { name: "Agree and lock the card" })).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("caution flags: agree stays disabled until the buyer says they understand", async () => {
    const onAction = renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("caution", [flag("PRICE_FAR_BELOW_MARKET", "caution")]) });
    const agree = screen.getByRole("button", { name: "Agree and lock the card" });
    expect(agree).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand, continue anyway/ }));
    expect(agree).toBeEnabled();
    await userEvent.click(agree);
    expect(onAction).toHaveBeenCalledWith("agree", { override: true });
  });

  it("payment-method flag: no override, no agree button, the plain sentence instead", () => {
    renderBar({ state: "REVIEWED", role: "buyer", verdict: verdict("stop", [flag("FRIENDS_AND_FAMILY_REQUEST", "stop"), flag("URGENCY_PRESSURE", "caution")]) });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agree and lock the card" })).not.toBeInTheDocument();
    expect(screen.getByText(BLOCKED_SENTENCE)).toBeInTheDocument();
  });
});
