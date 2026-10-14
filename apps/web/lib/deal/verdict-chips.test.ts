import { cleanPs5, fakeSlab, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { verdictChips } from "./verdict-chips";

const flag = (code: RedFlag["code"], severity: RedFlag["severity"], explanation = "x"): RedFlag => ({ code, severity, evidence: "e", explanation, raisedByRule: true });
const verdict = (o: Partial<Verdict> = {}): Verdict => ({ dealId: "d", cardVersion: 1, overall: "go", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "", createdAt: "2026-10-13T00:00:00.000Z", ...o });

describe("verdictChips", () => {
  it("is never more than three, flags first and worst first", () => {
    const chips = verdictChips(verdict({ flags: [flag("OTHER", "info"), flag("URGENCY_PRESSURE", "caution"), flag("INVITE_REFUSED", "stop"), flag("MISSING_SERIAL", "caution")] }), null);
    expect(chips.map((c) => c.label)).toEqual(["Refused Pay Pals", "Urgency pressure", "No serial read"]);
    expect(chips.map((c) => c.tone)).toEqual(["stop", "caution", "caution"]);
  });

  it("keeps the pal's full explanation and evidence on a flag chip, not a shortened one", () => {
    const [chip] = verdictChips(verdict({ flags: [{ ...flag("URGENCY_PRESSURE", "caution", "A long explanation that runs on well past the length of a chip label."), evidence: 'Seller wrote: "today only"' }] }), null);
    expect(chip!.detail).toBe("A long explanation that runs on well past the length of a chip label.");
    expect(chip!.evidence).toBe('Seller wrote: "today only"');
  });

  it("restates facts when there is nothing to flag: no flags, serial matches the box, price in range", () => {
    const card = cleanPs5.cards[cleanPs5.cards.length - 1]!;
    const chips = verdictChips(verdict({ priceCheck: cleanPs5.marketPrice }), { ...card, serial: card.boxSerial ?? "AJ1", boxSerial: card.boxSerial ?? "AJ1", askingPrice: 420 });
    expect(chips.map((c) => c.label)).toEqual(["No red flags", "Serial matches box", "Price in range"]);
    expect(chips.every((c) => c.tone === "go")).toBe(true);
  });

  it("claims no price chip for a graded slab", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const chips = verdictChips(verdict({ priceCheck: fakeSlab.marketPrice }), slab);
    expect(chips.map((c) => c.label)).not.toContain("Price in range");
  });

  it("says a matching cert is on record, and offers the table", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const chips = verdictChips(verdict({ certCheck: { record: fakeSlab.certRecord!, matches: true, explanation: "Matches." } }), slab);
    const cert = chips.find((c) => c.label === "Cert on record");
    expect(cert?.opensCertTable).toBe(true);
    // The D9 half of the sentence rides with it.
    expect(cert?.detail).toMatch(/doesn't prove the seller has it/);
  });

  it("every label is three words or fewer", () => {
    const codes: RedFlag["code"][] = ["FRIENDS_AND_FAMILY_REQUEST", "OFF_PLATFORM_PAYMENT", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE", "NAME_MISMATCH", "STOCK_OR_REUSED_PHOTO", "MISSING_SERIAL", "SHIP_BEFORE_PAY_TRICK", "INVITE_REFUSED", "CERT_MISMATCH", "MISSING_PACKING_PHOTO", "OTHER"];
    for (const code of codes) {
      const [chip] = verdictChips(verdict({ flags: [flag(code, "caution")] }), null);
      expect(chip!.label.split(" ").length, code).toBeLessThanOrEqual(3);
    }
  });
});
