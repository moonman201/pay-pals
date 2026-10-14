import { cleanPs5, fakeSlab, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictCard } from "./VerdictCard";

const flag = (code: RedFlag["code"], severity: RedFlag["severity"], explanation = "", evidence = "e"): RedFlag => ({ code, severity, evidence, explanation, raisedByRule: true });

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return { dealId: "d1", cardVersion: 1, overall: "stop", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "Stop.", createdAt: new Date().toISOString(), ...overrides };
}

const card = cleanPs5.cards[0]!;
const base = { card, chat: [], stale: null } as const;

describe("VerdictCard", () => {
  it("says one big word, names the pal that said it, and keeps its three-word contract", () => {
    for (const [overall, word, todo] of [
      ["stop", "Stop", "Don't pay."],
      ["caution", "Caution", "Ask first."],
      ["go", "Looks good", null],
    ] as const) {
      const { unmount } = render(<VerdictCard verdict={verdict({ overall, flags: overall === "go" ? [] : [flag("URGENCY_PRESSURE", "caution")] })} role="buyer" {...base} />);
      expect(screen.getByTestId("verdict")).toHaveAttribute("data-overall", overall);
      expect(screen.getByTestId("verdict-headline")).toHaveTextContent(word);
      if (todo) expect(screen.getByTestId("verdict-todo")).toHaveTextContent(todo);
      expect(screen.getByTestId("verdict").querySelector("img[data-pal='buyer']")).not.toBeNull();
      unmount();
    }
  });

  it("shows at most three reasons as short chips, worst first", () => {
    const v = verdict({
      flags: [flag("URGENCY_PRESSURE", "caution"), flag("OTHER", "info"), flag("INVITE_REFUSED", "stop"), flag("MISSING_SERIAL", "caution")],
    });
    render(<VerdictCard verdict={v} role="buyer" {...base} />);
    const chips = screen.getAllByTestId("verdict-chip");
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent("Refused Pay Pals");
    for (const chip of chips) expect((chip.textContent ?? "").trim().split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it("keeps the pal's whole sentence and its evidence quote one tap behind the chip", () => {
    const own = "Wants Friends and Family. That has no buyer protection.";
    const v = verdict({ flags: [flag("FRIENDS_AND_FAMILY_REQUEST", "stop", own, 'Seller wrote: "F&F only"')] });
    const { container } = render(<VerdictCard verdict={v} role="buyer" {...base} />);
    const chip = screen.getByTestId("verdict-chip");
    const slot = container.querySelector("[data-deck-detail]")!;
    expect(slot).toHaveAttribute("hidden");
    // In the page, hidden: nothing was deleted.
    expect(slot).toHaveTextContent(own);
    expect(slot).toHaveTextContent('Seller wrote: "F&F only"');
    fireEvent.click(chip);
    expect(slot).not.toHaveAttribute("hidden");
    expect(within(slot as HTMLElement).getByTestId("flag-evidence")).toHaveTextContent('Seller wrote: "F&F only"');
  });

  it("with nothing to flag, the only chip is the real price position, in used-range words", () => {
    render(<VerdictCard verdict={verdict({ overall: "go", priceCheck: cleanPs5.marketPrice })} role="buyer" {...base} />);
    const chips = screen.getAllByTestId("verdict-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("Fair used price");
    expect(screen.queryByText("No red flags")).not.toBeInTheDocument();
  });

  it("shows the price line on the card: asking, new at retail, the source, and the listings behind a tap", () => {
    render(<VerdictCard verdict={verdict({ overall: "go", priceCheck: cleanPs5.marketPrice })} role="buyer" {...base} />);
    const line = screen.getByTestId("price-line-card");
    expect(line).toHaveTextContent("Asking $420.00, new at retail $499.00, demo prices.");
    expect(line).toHaveTextContent("Show the listings");
    expect(line.textContent).not.toMatch(/amazon|walmart|best buy|ebay/i);
  });

  it("says via Channel3 when Channel3 gave the numbers, and leaves out a retail range it did not get", () => {
    const check = { ...cleanPs5.marketPrice, provider: "channel3" as const, sources: cleanPs5.marketPrice.sources.filter((s) => s.condition !== "new") };
    render(<VerdictCard verdict={verdict({ overall: "go", priceCheck: check })} role="buyer" {...base} />);
    const line = screen.getByTestId("price-line-card");
    expect(line).toHaveTextContent("Asking $420.00, via Channel3.");
    expect(line.textContent).not.toContain("new at retail");
  });

  it("shows no price line for a graded card", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    render(<VerdictCard verdict={verdict({ priceCheck: cleanPs5.marketPrice })} role="buyer" card={slab} chat={[]} stale={null} />);
    expect(screen.queryByTestId("price-line-card")).not.toBeInTheDocument();
  });

  it("opens the cert table right under the chips, in place", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const v = verdict({ certCheck: { record: fakeSlab.certRecord!, matches: true, explanation: "Matches." } });
    const { container } = render(<VerdictCard verdict={v} role="buyer" card={slab} chat={[]} stale={null} />);
    const chip = screen.getByRole("button", { name: /Cert on record/ });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "true");
    const slot = container.querySelector("[data-deck-detail]:not([hidden])")!;
    expect(within(slot as HTMLElement).getByTestId("comparison")).toBeInTheDocument();
    expect(slot).toHaveTextContent(/doesn't prove the seller has it/);
  });

  it("opens one chip at a time, and the chips are real buttons a keyboard can reach", () => {
    const v = verdict({ flags: [flag("FRIENDS_AND_FAMILY_REQUEST", "stop", "One."), flag("URGENCY_PRESSURE", "caution", "Two.")] });
    render(<VerdictCard verdict={v} role="buyer" {...base} />);
    const [a, b] = screen.getAllByRole("button");
    expect(a!.tagName).toBe("BUTTON");
    fireEvent.click(a!);
    expect(a).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(b!);
    expect(a).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveAttribute("aria-expanded", "true");
  });

  it("speaks to the seller as you in the seller's room", () => {
    const own = "He pushes you to pay before he has sent anything.";
    const v = verdict({ flags: [flag("URGENCY_PRESSURE", "caution", own)] });
    const { container } = render(<VerdictCard verdict={v} role="seller" {...base} />);
    expect(container.textContent).not.toMatch(/\bHe pushes\b/);
  });

  it("holds the one action beside the verdict, and the stale notice above it", () => {
    render(
      <VerdictCard verdict={verdict()} role="buyer" {...base} stale={{ reviewed: 1, current: 2 }}>
        <button type="button">Agree</button>
      </VerdictCard>,
    );
    expect(screen.getByRole("button", { name: "Agree" })).toBeInTheDocument();
    expect(screen.getByText(/This review was for card version 1/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Buyer Pal review" })).toBeInTheDocument();
  });
});
