import { fakeSlab, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictPanel } from "./VerdictPanel";

const flag = (code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag => ({ code, severity, evidence: "e", explanation: "x", raisedByRule: true });

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return { dealId: "d1", cardVersion: 1, overall: "stop", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "Stop.", createdAt: new Date().toISOString(), ...overrides };
}

describe("VerdictPanel", () => {
  it("shows the cert check with the card's grade once and the record's grade once", () => {
    const v = verdict({
      flags: [flag("CERT_MISMATCH", "stop")],
      certCheck: { record: fakeSlab.certRecord!, matches: false, explanation: "PSA's record for this cert is a different card and grade." },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} cardTitle={fakeSlab.cards[0]!.title} cardGrade="PSA 10" />);
    const block = screen.getByTestId("cert-check");
    expect(block).toHaveTextContent(/Cert 81234567/);
    expect(block).toHaveTextContent(/does not match the card/);
    expect(block).toHaveTextContent("Card says PSA 10. PSA (demo record) record says 2016 Pokemon XY Evolutions Charizard Holo #11, grade 7.");
    // Once in the sentence, once in the card title cell, once in the card grade cell of the comparison.
    expect(block.textContent?.match(/PSA 10/g)?.length).toBe(3);
    expect(block).not.toHaveTextContent("PSA 10, PSA 10");
    const rows = within(block).getAllByRole("row").slice(1);
    // Item, grade and year (1999 on the card, 2016 in the record) differ; the cert number itself is the one thing both sides share.
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["mismatch", "mismatch", "mismatch", "match"]);
    expect(within(rows[0]!).getByRole("rowheader")).toHaveTextContent("Item");
    expect(rows[1]).toHaveTextContent("7");
    expect(rows[2]).toHaveTextContent("2016");
    expect(screen.getByText("a grading cert that does not match PSA's record")).toBeInTheDocument();
  });

  it("says the record agrees on a match", () => {
    const v = verdict({ overall: "go", certCheck: { record: { ...fakeSlab.certRecord!, provider: "psa", subject: "1999 Pokemon Game Charizard Holo #4", grade: "10" }, matches: true, explanation: "Matches." } });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} cardGrade="PSA 10" />);
    expect(screen.getByTestId("cert-check")).toHaveTextContent("PSA record agrees: PSA 10");
  });

  it("renders each flag as three separate elements: severity pill, category word, no-override marker", () => {
    render(<VerdictPanel verdict={verdict({ cardVersion: 0, flags: [flag("INVITE_REFUSED", "stop")] })} currentVersion={0} locked={false} />);
    const row = screen.getByTestId("flag-badges");
    const parts = within(row).getAllByText(/stop|the seller refused Pay Pals protection|no override/);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.textContent)).toEqual(["stop", "the seller refused Pay Pals protection", "no override"]);
    expect(new Set(parts).size).toBe(3);
    for (const part of parts) {
      expect(part.className).toMatch(/border/);
      expect(part.parentElement).toBe(row);
    }
    expect(row.className).toMatch(/gap-/);
    expect(screen.queryByTestId("cert-check")).not.toBeInTheDocument();
    expect(screen.queryByText(/needs another look/)).not.toBeInTheDocument();
  });

  it("never renders a zero or flat market range: says no reliable price instead, with the source note", () => {
    const zero = verdict({ overall: "go", priceCheck: { marketLow: 0, marketHigh: 0, currency: "USD", provider: "channel3", sources: [], checkedAt: "2026-10-08T00:00:00.000Z" } });
    const { unmount } = render(<VerdictPanel verdict={zero} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("price-check")).toHaveTextContent("No reliable market price found");
    expect(screen.getByTestId("price-check")).toHaveTextContent("via Channel3");
    expect(screen.getByTestId("price-check")).not.toHaveTextContent("$0");
    unmount();
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: null })} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("price-check")).toHaveTextContent("No reliable market price found");
  });

  it("shows the listings as a count, a split and prices, and never a shop name", () => {
    const v = verdict({
      overall: "go",
      priceCheck: {
        marketLow: 588,
        marketHigh: 915,
        currency: "USD",
        provider: "channel3",
        checkedAt: new Date().toISOString(),
        sources: [
          { name: "gamestop.com", price: 588.99, condition: "new" },
          { name: "A marketplace listing", price: 914.99, condition: "used" },
        ],
      },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    const block = screen.getByTestId("price-check");
    expect(screen.getByTestId("price-sources")).toHaveTextContent("From 2 listings: 1 new, 1 used, $588.99 to $914.99");
    expect(block).toHaveTextContent("via Channel3");
    expect(block.textContent).not.toMatch(/gamestop|marketplace listing/i);
    expect(within(screen.getByRole("list", { name: "Listing prices" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["$588.99", "$914.99"]);
  });

  it("renders a real range with its sources", () => {
    const real = verdict({ overall: "go", priceCheck: fakeSlab.marketPrice });
    render(<VerdictPanel verdict={real} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("price-check")).toHaveTextContent(`Market range $${fakeSlab.marketPrice.marketLow} to $${fakeSlab.marketPrice.marketHigh}`);
    expect(screen.getByTestId("price-check")).toHaveTextContent("demo prices");
  });

  it("omits the no-override marker for a caution flag", () => {
    render(<VerdictPanel verdict={verdict({ overall: "caution", flags: [flag("URGENCY_PRESSURE", "caution")] })} currentVersion={1} locked={false} />);
    const row = screen.getByTestId("flag-badges");
    expect(within(row).queryByText("no override")).not.toBeInTheDocument();
    expect(within(row).getByText("caution")).toBeInTheDocument();
    expect(within(row).getByText("pressure to pay now")).toBeInTheDocument();
  });
  it("quotes the rule's evidence under its own label, behind a Why toggle", () => {
    const v = verdict({ flags: [{ ...flag("URGENCY_PRESSURE", "caution"), evidence: 'Seller wrote: "today only"' }] });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    const block = screen.getByTestId("flag-evidence");
    expect(block).toHaveTextContent("Evidence");
    expect(block).toHaveTextContent('Seller wrote: "today only"');
    expect(screen.getByText("Why")).toBeInTheDocument();
  });

  it("never prints a photo-handling artifact as evidence", () => {
    const v = verdict({ flags: [{ ...flag("URGENCY_PRESSURE", "caution"), evidence: "Photo block 2 of 4" }] });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    expect(screen.queryByTestId("flag-evidence")).not.toBeInTheDocument();
    expect(screen.queryByText(/Photo block/)).not.toBeInTheDocument();
  });
});
