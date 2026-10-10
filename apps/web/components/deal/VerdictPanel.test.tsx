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
    expect(block).toHaveTextContent(`Cert ${fakeSlab.certRecord!.certNumber}`);
    expect(block).toHaveTextContent(/does not match the card/);
    expect(block).toHaveTextContent(`Card says PSA 10. PSA (demo record) record says ${fakeSlab.certRecord!.subject}, grade ${fakeSlab.certRecord!.grade}.`);
    // Once in the sentence, once in the card title cell, once in the card grade cell of the comparison.
    expect(block.textContent?.match(/PSA 10/g)?.length).toBe(3);
    expect(block).not.toHaveTextContent("PSA 10, PSA 10");
    const rows = within(block).getAllByRole("row").slice(1);
    const record = fakeSlab.certRecord!;
    // The item and the grade are written differently on each side; the year and the cert number are the same.
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["mismatch", "mismatch", "match", "match"]);
    expect(within(rows[0]!).getByRole("rowheader")).toHaveTextContent("Item");
    expect(rows[1]).toHaveTextContent(record.grade!);
    expect(rows[2]).toHaveTextContent(record.year!);
    expect(screen.getByText("a grading cert that does not match PSA's record")).toBeInTheDocument();
  });

  it("says the record agrees on a match", () => {
    const v = verdict({ overall: "go", certCheck: { record: { ...fakeSlab.certRecord!, provider: "psa", grade: "10" }, matches: true, explanation: "Matches." } });
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

  it("shows the sentence that says how the range was reached, under the range and above the chips", () => {
    const note = "Estimated for a used unit from new retail prices (good: 70% of new), scaled from 11 new listings priced $588.99 to $949.99";
    const v = verdict({
      overall: "go",
      priceCheck: {
        marketLow: 412,
        marketHigh: 665,
        currency: "USD",
        provider: "channel3",
        checkedAt: new Date().toISOString(),
        sources: [{ name: note }, { name: "a shop", url: "https://shop.example/1", price: 588.99, condition: "new" }, { name: "another", url: "https://shop.example/2", price: 949.99, condition: "new" }],
      },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    const block = screen.getByTestId("price-check");
    expect(screen.getByTestId("price-method")).toHaveTextContent(note);
    // The count is the listings, not the sources: the note is not a listing.
    expect(screen.getByTestId("price-sources")).toHaveTextContent("From 2 listings: 2 new, $588.99 to $949.99");
    expect(block.textContent).not.toMatch(/shop\.example|a shop|another/);
    const order = [...block.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["price-method", "price-sources"]);
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

  it("renders the pal's reasons, with the ask down beside the questions for the seller", () => {
    const v = verdict({
      questionsForSeller: ["Can you send a close-up of the serial?"],
      reasoning: {
        checked: ["The asking price against the market range."],
        found: ["It sits below the range."],
        couldNotVerify: ["Whether the seller owns the item."],
        wouldChangeMyMind: ["A receipt from the original purchase."],
      },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    const blocks = screen.getAllByTestId("pal-reasons");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!).toHaveTextContent("What I could not check");
    expect(blocks[0]!).toHaveTextContent("Whether the seller owns the item.");
    expect(blocks[0]!).not.toHaveTextContent("What would change my mind");
    expect(blocks[1]!).toHaveTextContent("What would change my mind");
    // The ask comes after the questions for the seller, which is what it belongs with.
    const asked = screen.getByText("Asked of the seller");
    expect(asked.compareDocumentPosition(blocks[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders exactly as it did for a verdict with no reasons on it", () => {
    render(<VerdictPanel verdict={verdict()} currentVersion={1} locked={false} />);
    expect(screen.queryByTestId("pal-reasons")).not.toBeInTheDocument();
  });
});
