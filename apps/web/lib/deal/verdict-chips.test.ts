import { ALL_FIXTURES, cleanPs5, fakeSlab, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { createMemoryDealStore, createReplayClock } from "@pay-pals/db";
import { describe, expect, it } from "vitest";
import { createServices } from "../services";
import { seedFixtureDeals } from "../demo/seed-fixtures";
import { isGradedCard } from "./graded-price";
import { priceStance } from "./price-stance";
import { verdictChips, type VerdictChip } from "./verdict-chips";

const flag = (code: RedFlag["code"], severity: RedFlag["severity"], explanation = "x"): RedFlag => ({ code, severity, evidence: "e", explanation, raisedByRule: true });
const verdict = (o: Partial<Verdict> = {}): Verdict => ({ dealId: "d", cardVersion: 1, overall: "go", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "", createdAt: "2026-10-13T00:00:00.000Z", ...o });

/** A chip is real when the verdict has what it says: the flag, the comparison that ran, or the price check's own range. */
function expectChipIsReal(chip: VerdictChip, v: Verdict, card: Parameters<typeof priceStance>[1], where: string): void {
  if (chip.kind === "flag") {
    expect(v.flags.map((f) => f.code), `${where}: ${chip.label} has a flag behind it`).toContain(chip.flagCode);
  } else if (chip.kind === "cert") {
    expect(v.certCheck, `${where}: ${chip.label} has a cert comparison behind it`).toBeTruthy();
    expect(v.certCheck!.matches, `${where}: the comparison ran`).not.toBeNull();
  } else {
    expect(chip.price, where).not.toBeNull();
    // The price chip is the stance of the verdict's own price check, and never on a graded card.
    expect(isGradedCard(card ?? null), `${where}: no price chip on a graded card`).toBe(false);
    expect(priceStance(v.priceCheck, card)?.label, where).toBe(chip.label);
  }
}

describe("verdictChips", () => {
  it("is never more than three, flags first, a stop always ahead of a caution", () => {
    const chips = verdictChips(verdict({ flags: [flag("OTHER", "info"), flag("URGENCY_PRESSURE", "caution"), flag("INVITE_REFUSED", "stop"), flag("MISSING_SERIAL", "caution")] }), null);
    expect(chips.map((c) => c.label)).toEqual(["Refused Pay Pals", "Urgency pressure", "No serial read"]);
    expect(chips.map((c) => c.tone)).toEqual(["stop", "caution", "caution"]);
  });

  it("ranks within a severity by evidence, not by the order the pal listed: the finished slab shows Friends and Family, Reused photo, Urgency pressure", () => {
    // The stored order of the finished slab's flags, exactly.
    const stored = [flag("FRIENDS_AND_FAMILY_REQUEST", "stop"), flag("URGENCY_PRESSURE", "caution"), flag("NAME_MISMATCH", "caution"), flag("STOCK_OR_REUSED_PHOTO", "caution")];
    const chips = verdictChips(verdict({ overall: "stop", flags: stored }), null);
    expect(chips.map((c) => c.label)).toEqual(["Friends and Family", "Reused photo", "Urgency pressure"]);
  });

  it("follows the whole evidence order, and a stop still comes before every caution", () => {
    const order = ["CERT_MISMATCH", "STOCK_OR_REUSED_PHOTO", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE", "MISSING_SERIAL", "NAME_MISMATCH", "OTHER"] as const;
    const shuffled = [...order].reverse().map((code) => flag(code, "caution"));
    const first = verdictChips(verdict({ flags: [...shuffled, flag("OFF_PLATFORM_PAYMENT", "caution")] }), null);
    expect(first[0]!.flagCode).toBe("OFF_PLATFORM_PAYMENT");
    const all = [...order].reverse().map((code) => flag(code, "caution"));
    // Three chips at most, so check the ranking through the first three of any shuffle.
    expect(verdictChips(verdict({ flags: all }), null).map((c) => c.flagCode)).toEqual(["CERT_MISMATCH", "STOCK_OR_REUSED_PHOTO", "PRICE_FAR_BELOW_MARKET"]);
    const stopLast = verdictChips(verdict({ flags: [flag("CERT_MISMATCH", "caution"), flag("STOCK_OR_REUSED_PHOTO", "caution"), flag("URGENCY_PRESSURE", "stop")] }), null);
    expect(stopLast[0]!.flagCode).toBe("URGENCY_PRESSURE");
  });

  it("keeps the pal's full explanation and evidence on a flag chip, not a shortened one", () => {
    const [chip] = verdictChips(verdict({ flags: [{ ...flag("URGENCY_PRESSURE", "caution", "A long explanation that runs on well past the length of a chip label."), evidence: 'Seller wrote: "today only"' }] }), null);
    expect(chip!.detail).toBe("A long explanation that runs on well past the length of a chip label.");
    expect(chip!.evidence).toBe('Seller wrote: "today only"');
  });

  it("invents nothing: no flags, no cert comparison and no price result is no chips", () => {
    const card = cleanPs5.cards[cleanPs5.cards.length - 1]!;
    expect(verdictChips(verdict({ priceCheck: null }), { ...card, serial: card.boxSerial ?? "AJ1", boxSerial: card.boxSerial ?? "AJ1" })).toEqual([]);
  });

  it("a price chip is the real price position, in the used range for a used item", () => {
    const card = cleanPs5.cards[cleanPs5.cards.length - 1]!;
    const chips = verdictChips(verdict({ priceCheck: cleanPs5.marketPrice }), card);
    expect(chips.map((c) => c.label)).toEqual(["Fair used price"]);
    const under = verdictChips(verdict({ priceCheck: { ...cleanPs5.marketPrice, marketLow: 412.29, marketHigh: 615.99 } }), { ...card, askingPrice: 410 });
    expect(under.map((c) => c.label)).toEqual(["Just under used range"]);
  });

  it("claims no price chip for a graded slab, even when a check returned a range", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const chips = verdictChips(verdict({ priceCheck: { ...cleanPs5.marketPrice } }), slab);
    expect(chips.filter((c) => c.kind === "price")).toEqual([]);
  });

  it("a flagged price says it once, as the flag", () => {
    const card = cleanPs5.cards[cleanPs5.cards.length - 1]!;
    const chips = verdictChips(verdict({ priceCheck: cleanPs5.marketPrice, flags: [flag("PRICE_FAR_BELOW_MARKET", "stop")] }), card);
    expect(chips.map((c) => c.kind)).toEqual(["flag"]);
  });

  it("a cert chip needs a comparison that ran", () => {
    const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
    const ran = verdictChips(verdict({ certCheck: { record: fakeSlab.certRecord!, matches: true, explanation: "Matches." } }), slab);
    expect(ran.map((c) => c.label)).toEqual(["Cert on record"]);
    const didNot = verdictChips(verdict({ certCheck: { record: fakeSlab.certRecord!, matches: null, explanation: "Could not compare." } }), slab);
    expect(didNot).toEqual([]);
  });

  it("every flag label is three words or fewer", () => {
    const codes: RedFlag["code"][] = ["FRIENDS_AND_FAMILY_REQUEST", "OFF_PLATFORM_PAYMENT", "PRICE_FAR_BELOW_MARKET", "URGENCY_PRESSURE", "NAME_MISMATCH", "STOCK_OR_REUSED_PHOTO", "MISSING_SERIAL", "SHIP_BEFORE_PAY_TRICK", "INVITE_REFUSED", "CERT_MISMATCH", "MISSING_PACKING_PHOTO", "OTHER"];
    for (const code of codes) {
      const [chip] = verdictChips(verdict({ flags: [flag(code, "caution")] }), null);
      expect(chip!.label.split(" ").length, code).toBeLessThanOrEqual(3);
    }
  });
});

describe("every chip of every scenario maps to a flag or a result the pal produced", () => {
  it("on the fixtures' own verdict data", () => {
    for (const f of ALL_FIXTURES) {
      const card = f.cards[f.cards.length - 1]!;
      const v = verdict({
        overall: f.expectedVerdict.overall,
        flags: f.expectedVerdict.requiredFlags.map((code) => flag(code, "caution")),
        priceCheck: f.marketPrice,
        certCheck: f.certRecord ? { record: f.certRecord, matches: true, explanation: "Matches." } : null,
      });
      for (const chip of verdictChips(v, card)) expectChipIsReal(chip, v, card, `${f.id} fixture`);
    }
  });

  it("on the verdicts the keyless pals wrote when the demo deals were seeded (the same rules-only review a live keyless deal runs)", async () => {
    const replay = createReplayClock();
    let seeding = true;
    const store = createMemoryDealStore({ clock: () => (seeding ? replay.clock() : new Date()) });
    const base = createServices({}, () => {});
    const ids = await seedFixtureDeals({ store, buyerPal: base.buyerPal, buildEvidencePack: base.buildEvidencePack, demoPayee: null, clock: replay.clock }, () => {}, replay);
    seeding = false;
    for (const f of ALL_FIXTURES) {
      const id = ids[f.id]!;
      const verdicts = await store.listVerdicts(id);
      const cards = await store.listCards(id);
      expect(verdicts.length, f.id).toBeGreaterThan(0);
      const v = verdicts[verdicts.length - 1]!;
      const card = cards[cards.length - 1]!;
      const chips = verdictChips(v, card);
      for (const chip of chips) expectChipIsReal(chip, v, card, `${f.id} seeded`);
      // The stop flag, when there is one, leads.
      if (v.flags.some((x) => x.severity === "stop")) expect(chips[0]!.tone, `${f.id}: a stop leads`).toBe("stop");
    }
  });
});
