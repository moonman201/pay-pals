import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DealSteps } from "./DealSteps";

describe("DealSteps", () => {
  it("shows three short steps, not four paragraphs", () => {
    render(<DealSteps />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect((b.textContent ?? "").trim().split(/\s+/).length, b.textContent ?? "").toBeLessThanOrEqual(7);
  });

  it("keeps every old sentence, one tap behind its step", () => {
    const { container } = render(<DealSteps />);
    const all = container.textContent ?? "";
    for (const line of [
      "You invite the seller with their PayPal email and the listing link. They get a link to join.",
      "Seller Pal turns their photos into an item card with the serial or cert number on it.",
      "Buyer Pal checks the price, the cert and the chat. A refusal to use Pay Pals is a risk signal.",
      "Both agree, then the card locks into a PayPal Goods and Services order; packing photos, tracking and an arrival check follow.",
    ]) {
      expect(all).toContain(line);
    }
    // Hidden until tapped.
    expect(container.querySelector("[data-deck-detail='check']")).toHaveAttribute("hidden");
    fireEvent.click(screen.getByTestId("deal-step-check"));
    expect(container.querySelector("[data-deck-detail='check']")).not.toHaveAttribute("hidden");
  });
});
