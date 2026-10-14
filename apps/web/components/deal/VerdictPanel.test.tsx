import { cleanPs5, fakeSlab, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictPanel } from "./VerdictPanel";

/* Explanation empty so the reasons come from the fallback map. The pal's own
   sentence is preferred when it has one, which review-lead.test.ts covers. */
const flag = (code: RedFlag["code"], severity: RedFlag["severity"], explanation = ""): RedFlag => ({ code, severity, evidence: "e", explanation, raisedByRule: true });

/**
 * A price check that came back with a range. The slab fixture no longer carries one (a graded card cannot be priced, F14),
 * and the panel's rule is about what it does when a check returns one anyway.
 */
const RETURNED_RANGE = { ...cleanPs5.marketPrice, marketLow: 305, marketHigh: 493, sources: [{ name: "Graded sale, PSA 10", price: 305, condition: "like_new" }, { name: "Graded sale, PSA 10", price: 493, condition: "like_new" }] };

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
    // One header line, then the table. The closing paragraph that repeated the
    // header in other words is gone (Matt's rule 1).
    expect(screen.getByTestId("cert-headline")).toHaveTextContent(`Cert ${fakeSlab.certRecord!.certNumber} does not match the demo PSA record.`);
    expect(block).toHaveTextContent("PSA's record for this cert is a different card and grade.");
    // Once in the card title cell, once in the card grade cell of the comparison.
    expect(block.textContent?.match(/PSA 10/g)?.length).toBe(2);
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

  it("says the record agrees, and in the same breath what that does not prove", () => {
    const v = verdict({ overall: "go", certCheck: { record: { ...fakeSlab.certRecord!, provider: "psa", grade: "10" }, matches: true, explanation: "Matches." } });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} cardGrade="PSA 10" />);
    const headline = screen.getByTestId("cert-headline");
    expect(headline).toHaveTextContent(`Cert ${fakeSlab.certRecord!.certNumber} matches PSA's record.`);
    // The half that matters: a real slab is not the same thing as this seller having it.
    expect(headline).toHaveTextContent("The slab exists. That doesn't prove the seller has it.");
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
    // The chips sit behind an expander; the range line stays visible.
    const details = screen.getByText("Show the 2 listings").closest("details")!;
    expect(details.tagName).toBe("DETAILS");
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("Show the 2 listings")).toBeInTheDocument();
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
    // The comparison leads, then the derived band's own note, then the chips.
    expect(order).toEqual(["price-comparison", "asking-price", "retail-range", "price-method", "price-sources"]);
  });

  /**
   * The clean deal exactly as production holds it, read off the live API on
   * Oct 11. The point of pinning the real numbers is that the derived band
   * (412.29 to 640.49) and the returned retail range (588.99 to 914.99) are
   * different figures, and the panel must not confuse them.
   */
  const liveClean = {
    marketLow: 412.29,
    marketHigh: 640.49,
    currency: "USD" as const,
    provider: "channel3" as const,
    checkedAt: "2026-10-11T01:52:22.779Z",
    sources: [
      { name: "Showing the 12 cheapest of 13 priced listings; Estimated for a used unit from new retail prices (good: 70% of new), scaled from 11 new listings priced $588.99 to $914.99" },
      { name: "Retail listing, new", price: 588.99, condition: "new", url: "https://shop.example/1" },
      { name: "Used listing", price: 588.99, condition: "used", url: "https://shop.example/2" },
      ...[649.99, 649.99, 776.99, 779.99, 824.99, 858.99, 879.99, 879.99, 899.99, 914.99].map((price, i) => ({
        name: "Retail listing, new",
        price,
        condition: "new",
        url: `https://shop.example/${i + 3}`,
      })),
    ],
  };

  it("puts the asking price beside the retail range Channel3 returned, with the count and the source named", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: liveClean })} currentVersion={1} locked={false} askingPrice={420} />);
    const comparison = screen.getByTestId("price-comparison");
    expect(within(comparison).getByTestId("asking-price")).toHaveTextContent("$420.00");
    expect(within(comparison).getByTestId("retail-range")).toHaveTextContent("$588.99 to $914.99");
    expect(comparison).toHaveTextContent("Asking price");
    // "New" is load-bearing: the item is used, so the comparison must say what it is against.
    expect(comparison).toHaveTextContent("New at retail");
    expect(comparison).toHaveTextContent("across 11 new listings");
    expect(comparison).toHaveTextContent("via Channel3");
  });

  it("keeps the returned retail range and the derived band apart, both on the page", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: liveClean })} currentVersion={1} locked={false} askingPrice={420} />);
    // The comparison carries only the figures Channel3 returned.
    const comparison = screen.getByTestId("price-comparison");
    expect(comparison.textContent).not.toMatch(/412|640/);
    // The derived band keeps its own line, and the note under it says how it was reached.
    expect(screen.getByTestId("price-check")).toHaveTextContent("Market range $412.29 to $640.49");
    expect(screen.getByTestId("price-method")).toHaveTextContent("70% of new");
  });

  it("leaves the priceless method note out of the retail count and the range", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: liveClean })} currentVersion={1} locked={false} askingPrice={420} />);
    // 13 sources, 12 priced, 11 of them new. Neither the note nor the used listing is counted.
    expect(liveClean.sources).toHaveLength(13);
    expect(screen.getByTestId("price-comparison")).toHaveTextContent("across 11 new listings");
    expect(screen.getByTestId("price-sources")).toHaveTextContent("From 12 listings: 11 new, 1 used");
  });

  it("names no shop in the comparison, the same rule as the rest of the panel", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: liveClean })} currentVersion={1} locked={false} askingPrice={420} />);
    expect(screen.getByTestId("price-comparison").textContent).not.toMatch(/shop\.example|\.com/i);
  });

  it("says so plainly when the card carries no asking price, rather than printing a bare dollar sign", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: liveClean })} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("asking-price")).toHaveTextContent("Not on the card");
    expect(screen.getByTestId("retail-range")).toHaveTextContent("$588.99 to $914.99");
  });

  it("shows no comparison at all when the lookup returned no new listing", () => {
    const used = verdict({
      overall: "go",
      priceCheck: { ...liveClean, sources: [{ name: "Used listing", price: 380, condition: "good" }] },
    });
    render(<VerdictPanel verdict={used} currentVersion={1} locked={false} askingPrice={420} />);
    expect(screen.queryByTestId("price-comparison")).not.toBeInTheDocument();
    // The panel is exactly what it was before: the band, and the listings under it.
    expect(screen.getByTestId("price-check")).toHaveTextContent("Market range $412.29 to $640.49");
    expect(screen.getByTestId("price-sources")).toHaveTextContent("From 1 listing: 1 used, $380");
  });

  it("shows no comparison when there is no price check, and still says no reliable price", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: null })} currentVersion={1} locked={false} askingPrice={420} />);
    expect(screen.queryByTestId("price-comparison")).not.toBeInTheDocument();
    expect(screen.getByTestId("price-check")).toHaveTextContent("No reliable market price found");
  });

  it("offers no retail comparison for a graded card, whose sales are all used", () => {
    // Every slab source is a like_new graded sale, so there is no "new at retail" to compare to.
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: RETURNED_RANGE })} currentVersion={1} locked={false} askingPrice={140} />);
    expect(screen.queryByTestId("price-comparison")).not.toBeInTheDocument();
    expect(screen.getByTestId("price-check")).toHaveTextContent("demo prices");
  });

  it("calls a demo check demo prices in the comparison too, never Channel3", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: cleanPs5.marketPrice })} currentVersion={1} locked={false} askingPrice={420} />);
    const comparison = screen.getByTestId("price-comparison");
    expect(comparison).toHaveTextContent("demo prices");
    expect(comparison).not.toHaveTextContent("Channel3");
    expect(within(comparison).getByTestId("retail-range")).toHaveTextContent("$499.00");
    expect(comparison).toHaveTextContent("across 1 new listing");
  });

  it("renders a real range with its sources", () => {
    const real = verdict({ overall: "go", priceCheck: RETURNED_RANGE });
    render(<VerdictPanel verdict={real} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("price-check")).toHaveTextContent(`Market range $${RETURNED_RANGE.marketLow} to $${RETURNED_RANGE.marketHigh}`);
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

  it("says a flag's reason once on the card, with its evidence", () => {
    const own = "Wants Friends and Family. That has no buyer protection.";
    const v = verdict({ flags: [{ ...flag("FRIENDS_AND_FAMILY_REQUEST", "stop", own), evidence: 'Seller wrote: "F&F only"' }] });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    expect(screen.getAllByText(own)).toHaveLength(1);
    expect(screen.getByTestId("flag-evidence")).toHaveTextContent('Seller wrote: "F&F only"');
  });

  it("keeps a long explanation on the card, because the lead shows only a short fallback for it", () => {
    const long = "A long explanation that runs well past a single line because the pal wrote a whole paragraph about this flag and what it means.";
    render(<VerdictPanel verdict={verdict({ flags: [flag("STOCK_OR_REUSED_PHOTO", "caution", long)] })} currentVersion={1} locked={false} />);
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  it("never prints a photo-handling artifact as evidence", () => {
    const v = verdict({ flags: [{ ...flag("URGENCY_PRESSURE", "caution"), evidence: "Photo block 2 of 4" }] });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    expect(screen.queryByTestId("flag-evidence")).not.toBeInTheDocument();
    expect(screen.queryByText(/Photo block/)).not.toBeInTheDocument();
  });

  it("puts the pal's working behind one expander, collapsed, with nothing deleted", () => {
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
    const work = screen.getByTestId("pal-work");
    expect(work.tagName).toBe("DETAILS");
    // Rule 4: collapsed by default, so honesty is one click away and never in the way.
    expect(work).not.toHaveAttribute("open");
    expect(screen.getByText("Show the pal's work")).toBeInTheDocument();
    // Still on the page, inside it.
    expect(work).toHaveTextContent("What I checked");
    expect(work).toHaveTextContent("What I could not check");
    expect(work).toHaveTextContent("Whether the seller owns the item.");
  });

  it("drops What I found from the room, because the reasons and the flag cards are those findings", () => {
    const v = verdict({
      reasoning: { checked: ["The price."], found: ["It sits below the range."], couldNotVerify: ["Who holds it."], wouldChangeMyMind: [] },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    expect(screen.queryByText("What I found")).not.toBeInTheDocument();
  });

  it("puts what would change the pal's mind at the top only, never twice", () => {
    const v = verdict({
      flags: [flag("URGENCY_PRESSURE", "caution")],
      reasoning: { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: ["The seller agreeing to wait until these checks are done would change this."] },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("look-again")).toHaveTextContent("I'd look again if The seller agreeing to wait");
    expect(screen.queryByText("What would change my mind")).not.toBeInTheDocument();
    expect(document.body.textContent?.match(/would change this/g)).toHaveLength(1);
  });

  it("keeps every ask on the page when the lead has room for only two", () => {
    // Rule 4 over rule 1: the lead may be short, it may not be the only place
    // an ask lived and then drop it. Two up top, the rest behind the disclosure.
    const five = ["One would change this.", "Two would change this.", "Three would change this.", "Four would change this.", "Five would change this."];
    const v = verdict({ reasoning: { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: five } });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} />);
    expect(screen.getByTestId("look-again")).toHaveTextContent("One would change this. two would change this.");
    const rest = screen.getByTestId("rest-of-asks");
    for (const ask of five.slice(2)) expect(rest).toHaveTextContent(ask);
    // And the page as a whole still carries all five. Case-insensitive, because
    // joining the second into the sentence lowercases its first letter on purpose.
    const page = document.body.textContent!.toLowerCase();
    for (const ask of five) expect(page, ask).toContain(ask.toLowerCase());
  });

  it("renders no expander at all for a verdict with no reasons on it", () => {
    render(<VerdictPanel verdict={verdict()} currentVersion={1} locked={false} />);
    expect(screen.queryByTestId("pal-work")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pal-reasons")).not.toBeInTheDocument();
  });
});

describe("VerdictPanel, the seller's view", () => {
  const asks = ["he sends a close-up of the serial label on the console", "he sends the slab next to his name and today's date"];
  const v = () =>
    verdict({
      overall: "caution",
      flags: [flag("STOCK_OR_REUSED_PHOTO", "caution", "One of his photos matches a listing photo already on file.")],
      reasoning: { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: asks },
    });

  it("speaks to the seller as you in the look-again line", () => {
    render(<VerdictPanel verdict={v()} currentVersion={1} locked={false} role="seller" />);
    const line = screen.getByTestId("look-again");
    expect(line).toHaveTextContent("The Buyer Pal would look again if you send a close-up of the serial label on the console or you send the slab next to your name and today's date.");
    expect(line.textContent).not.toMatch(/\b(he|his|him)\b/i);
  });

  it("keeps the buyer's wording for the buyer", () => {
    render(<VerdictPanel verdict={v()} currentVersion={1} locked={false} role="buyer" />);
    expect(screen.getByTestId("look-again")).toHaveTextContent("I'd look again if he sends a close-up");
  });
});

describe("VerdictPanel, a graded card", () => {
  const slabCard = fakeSlab.cards[fakeSlab.cards.length - 1]!;

  it("claims no market price for a graded card, even when the check returned one", () => {
    // The check carries a 305 to 493 range. Channel3 prices retail stock,
    // so for one graded slab that number would be about a different thing.
    render(<VerdictPanel verdict={verdict({ overall: "stop", priceCheck: RETURNED_RANGE })} currentVersion={1} locked={false} card={slabCard} askingPrice={140} />);
    const block = screen.getByTestId("price-check");
    expect(block).toHaveTextContent("Price: can't check automatically. Channel3 covers retail stores, not graded cards.");
    expect(block.textContent).not.toMatch(/305|493|Market range|New at retail/);
    expect(screen.queryByTestId("price-comparison")).not.toBeInTheDocument();
  });

  it("gives PriceCharting and 130point each a link, in a new tab", () => {
    render(<VerdictPanel verdict={verdict({ overall: "stop", priceCheck: RETURNED_RANGE })} currentVersion={1} locked={false} card={slabCard} />);
    const pc = screen.getByRole("link", { name: "PriceCharting" });
    const pt = screen.getByRole("link", { name: "130point" });
    for (const link of [pc, pt]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveClass("min-h-11");
    }
    expect(pc.getAttribute("href")).toContain("pricecharting.com");
    expect(pt.getAttribute("href")).toContain("130point.com");
    expect(pt.getAttribute("href")).toContain(encodeURIComponent(slabCard.title).slice(0, 20));
  });

  it("leaves a card with no cert number alone, which is every other deal", () => {
    render(<VerdictPanel verdict={verdict({ overall: "go", priceCheck: cleanPs5.marketPrice })} currentVersion={1} locked={false} card={cleanPs5.cards[0]!} askingPrice={420} />);
    expect(screen.getByTestId("price-check")).toHaveTextContent("Market range");
    expect(screen.getByTestId("price-check")).not.toHaveTextContent("can't check automatically");
  });
});
