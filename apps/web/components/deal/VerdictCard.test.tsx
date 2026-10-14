import { cleanPs5, type RedFlag, type Verdict } from "@pay-pals/contracts";
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

  it("falls back to plain facts when there is nothing to flag", () => {
    render(<VerdictCard verdict={verdict({ overall: "go", priceCheck: cleanPs5.marketPrice })} role="buyer" {...base} />);
    expect(screen.getAllByTestId("verdict-chip")[0]).toHaveTextContent("No red flags");
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
