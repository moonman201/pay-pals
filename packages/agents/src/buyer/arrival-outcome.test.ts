/**
 * The arrival outcome, now three values. Same band as the review side, but the
 * stakes are higher here: a mismatch sends a buyer to PayPal, so a difference
 * of one character must not produce one.
 *
 * The two lists answer different questions and these tests hold that apart.
 * `mismatches` is what positively differed; `unsettled` is what could not be
 * settled. Before this, both went in one list and both read as "the wrong item
 * arrived", which on an unreadable photo was a claim with nothing behind it.
 */
import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, cleanPs5, emptyBox } from "@pay-pals/contracts";
import { compareToCard, outcomeOf } from "./arrival";
import { buildEvidencePack } from "../evidence/build-evidence-pack";
import { createBuyerPal } from "./buyer-pal";
import { createFixturePriceLookup } from "../price/fixture-lookup";

const card = { ...cleanPs5.cards[1]!, serial: CLEAN_SERIAL };
const evidence = { packagingSerial: null, missing: null, photosProvided: true };
const seen = (serial: string | null) => ({ brand: null, model: null, serial, serialSource: "photo" as const });

describe("the arrival comparison", () => {
  it("matches when the numbers agree", () => {
    const out = compareToCard(card, seen(CLEAN_SERIAL), evidence);
    expect(outcomeOf(out)).toBe("match");
    expect(out.mismatches).toEqual([]);
    expect(out.unsettled).toEqual([]);
  });

  it.each(["AJ16495258O", "AJ16495258Q", "AJ16952580"])("is inconclusive, not a mismatch, on the misread %s", (misread) => {
    const out = compareToCard(card, seen(misread), evidence);
    expect(outcomeOf(out)).toBe("inconclusive");
    // Nothing differed, so nothing belongs in mismatches. That is the whole distinction.
    expect(out.mismatches).toEqual([]);
    expect(out.unsettled).toHaveLength(1);
    expect(out.unsettled[0]!.explanation).toContain("more likely one number read twice");
  });

  it("is still a mismatch on a genuinely different unit", () => {
    const out = compareToCard(card, seen("AJ100000001"), evidence);
    expect(outcomeOf(out)).toBe("mismatch");
    expect(out.unsettled).toEqual([]);
    expect(out.mismatches[0]!.explanation).toContain("This is a different unit.");
  });

  it("is a mismatch on a one-character difference when the number came from a caption", () => {
    // The band covers what a photo read could have got wrong. A caption is the buyer's typing.
    const out = compareToCard(card, { brand: null, model: null, serial: "AJ16495258O", serialSource: "description" }, evidence);
    expect(outcomeOf(out)).toBe("mismatch");
  });

  it("is inconclusive when no serial could be read, because no comparison happened", () => {
    const out = compareToCard(card, seen(null), evidence);
    expect(outcomeOf(out)).toBe("inconclusive");
    expect(out.mismatches).toEqual([]);
    expect(out.unsettled[0]!.observed).toBe("not readable in the arrival photos");
  });

  it("lets a real difference outrank an unsettled one", () => {
    const out = compareToCard(card, { brand: "Microsoft", model: null, serial: "AJ16495258O", serialSource: "photo" }, evidence);
    expect(out.mismatches.some((m) => m.field === "brand")).toBe(true);
    expect(outcomeOf(out)).toBe("mismatch");
  });
});

describe("what the pal says on an inconclusive arrival", () => {
  const pal = () => createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

  it("says neither that it matched nor that the wrong item arrived, and asks for the photo", async () => {
    // Only the box-label photo: nothing readable on the item, so nothing was compared.
    const { data: check, palMessage } = await pal().checkArrival(emptyBox.cards[0]!, [emptyBox.arrivalPhotos[1]!]);
    expect(check.outcome).toBe("inconclusive");
    expect(check.mismatches).toEqual([]);
    expect(check.unsettled).toHaveLength(1);

    expect(palMessage).not.toContain("matches the locked card");
    expect(palMessage).not.toContain("This is not the item on the card");
    expect(palMessage).toContain("I cannot confirm this is the unit on the card");
    expect(palMessage).toContain("not the same as saying the wrong item arrived");
    expect(palMessage).toContain("Add a clear photo of the serial on the item.");
    // It must not send the buyer to PayPal over a comparison it could not make.
    expect(palMessage).not.toContain("dispute");
  });

  it("puts the unsettled comparison in couldNotVerify and keeps it out of found", async () => {
    const { data: check } = await pal().checkArrival(emptyBox.cards[0]!, [emptyBox.arrivalPhotos[1]!]);
    const reasoning = check.reasoning!;
    expect(reasoning.couldNotVerify.join(" ")).toContain("no serial on the item");
    expect(reasoning.found.join(" ")).not.toContain("contradicts the locked card");
    expect(reasoning.wouldChangeMyMind.length).toBeGreaterThan(0);
  });
});

describe("an inconclusive arrival never invites a dispute", () => {
  const base = {
    deal: emptyBox.deal,
    lockedCard: emptyBox.cards.at(-1)!,
    verdicts: [],
    messages: emptyBox.chat,
    payment: emptyBox.payment,
    shipment: emptyBox.shipment,
    timeline: emptyBox.timeline,
    requestedBy: "buyer" as const,
  };
  const check = (outcome: string, extra: Record<string, unknown> = {}) =>
    ({
      dealId: emptyBox.deal.id,
      cardVersion: 1,
      outcome,
      mismatches: [],
      observed: { brand: null, model: null, serial: null },
      palMessage: "x",
      createdAt: new Date().toISOString(),
      ...extra,
    }) as never;

  it("says there is nothing to dispute yet, and what would settle it", async () => {
    const unsettled = [{ field: "serial", expected: CLEAN_SERIAL, observed: "AJ16495258O", explanation: "One character apart." }];
    const pack = await buildEvidencePack({ ...base, arrivalCheck: check("inconclusive", { unsettled }) }, { anthropic: null });
    expect(pack.palMessage).toContain("nothing to dispute yet");
    expect(pack.palMessage).not.toContain("You can open a dispute");
    expect(pack.data.summary).toContain("neither a match nor a mismatch");
    expect(pack.data.summary).not.toContain("did not match the locked card");
  });

  it("still invites one on a real mismatch", async () => {
    const mismatches = [{ field: "serial", expected: CLEAN_SERIAL, observed: "AJ100000001", explanation: "A different unit." }];
    const pack = await buildEvidencePack({ ...base, arrivalCheck: check("mismatch", { mismatches }) }, { anthropic: null });
    expect(pack.palMessage).toContain("You can open a dispute");
    expect(pack.data.summary).toContain("did not match the locked card");
  });

  it("invites nothing on a match", async () => {
    const pack = await buildEvidencePack({ ...base, arrivalCheck: check("match") }, { anthropic: null });
    expect(pack.palMessage).not.toContain("dispute");
    expect(pack.data.summary).toContain("matched the locked card");
  });
});
