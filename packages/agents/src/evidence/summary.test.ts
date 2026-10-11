import { describe, expect, it } from "vitest";
import type { EvidenceInput, HistoryAnchor } from "@pay-pals/contracts";
import { EMPTY_BOX_LOCKED_SERIAL, cleanPs5, emptyBox } from "@pay-pals/contracts";
import { fakeClaude } from "../testing/fake-claude";
import { dropHeadingLine, deterministicSummary, tamperCheck, writeSummary } from "./summary";

const input = (fixture: typeof emptyBox): EvidenceInput => ({
  deal: fixture.deal,
  lockedCard: fixture.cards.at(-1)!,
  verdicts: [],
  arrivalCheck: null,
  messages: fixture.chat,
  payment: fixture.payment,
  shipment: fixture.shipment,
  timeline: fixture.timeline,
  arrivalPhotos: fixture.arrivalPhotos,
  requestedBy: "buyer",
});

/** A client whose one text call returns the given prose. */
function proseClient(text: string) {
  const client = fakeClaude(() => null);
  client.messages.create = async () => ({ content: [{ type: "text", text }], stop_reason: "end_turn" }) as never;
  return client;
}

/**
 * The tamper check, in all three anchoring cases. The rule under every one of
 * them: the sentence may claim PayPal's side only when historyAnchor says
 * PayPal's side was actually read, and absent must read as the conservative
 * case so a pack stored before the field existed never starts claiming
 * corroboration. The overclaim these replaced sat on the seeded empty-box pack
 * one paragraph away from a line saying no PayPal order holds the head.
 */
describe("the tamper check tells the three anchoring cases apart", () => {
  // A real head from the chain, so historyMatchesHead actually verifies.
  const head = emptyBox.timeline.find((e) => e.kind === "payment_created")!.hash;
  const withHash = (anchor?: HistoryAnchor): EvidenceInput => ({
    ...input(emptyBox),
    payment: { ...emptyBox.payment!, historyHash: head },
    ...(anchor ? { historyAnchor: anchor } : {}),
  });
  const broken = (anchor?: HistoryAnchor): EvidenceInput => ({
    ...input(emptyBox),
    payment: { ...emptyBox.payment!, historyHash: "a".repeat(64) },
    ...(anchor ? { historyAnchor: anchor } : {}),
  });

  /** Phrases that assert PayPal's side. Only "corroborated" may use any of them. */
  const PAYPAL_CLAIMS = [/\bnot edited after payment\b/i, /PayPal(?:'s)? (?:own )?cop(?:y|ies) (?:carries|matches|holds)/i, /the history PayPal holds/i];

  it("corroborated: says PayPal's copy was read back and carries the same hash", () => {
    const sentence = tamperCheck(withHash("corroborated"))!;
    expect(sentence).toContain("reproduce the hash recorded with this payment");
    expect(sentence).toContain("PayPal's own copy of that hash was read back for this pack and carries the same one");
    expect(sentence).toContain("The stored history is the history PayPal holds.");
    expect(sentence.trimEnd().endsWith(`The hash is ${head}.`)).toBe(true);
  });

  it("corroborated and broken: says the stored history differs from what PayPal holds", () => {
    const sentence = tamperCheck(broken("corroborated"))!;
    expect(sentence).toContain("do not reproduce the hash recorded with this payment");
    expect(sentence).toContain("The stored history differs from what PayPal holds.");
  });

  it("recorded_only: says the check is against our own record, not PayPal's", () => {
    const sentence = tamperCheck(withHash("recorded_only"))!;
    expect(sentence).toContain("an edit to them would break the chain");
    expect(sentence).toContain("was not read back for this pack, so this check is against our own record of it and not against PayPal's");
    for (const claim of PAYPAL_CLAIMS) expect(sentence).not.toMatch(claim);
  });

  it("recorded_only and broken: says our own two records disagree, and reaches no further", () => {
    const sentence = tamperCheck(broken("recorded_only"))!;
    expect(sentence).toContain("do not reproduce the hash recorded with this payment");
    expect(sentence).toContain("has been changed since that hash was taken");
    for (const claim of PAYPAL_CLAIMS) expect(sentence).not.toMatch(claim);
  });

  it("not_anchored: says no PayPal order holds the hash and why", () => {
    const sentence = tamperCheck(withHash("not_anchored"))!;
    expect(sentence).toContain("an edit to them would break the chain");
    expect(sentence).toContain("No PayPal order holds this hash, because the payment ids on this deal are placeholders");
    expect(sentence).toContain("nothing on PayPal's side to compare it against");
    for (const claim of PAYPAL_CLAIMS) expect(sentence).not.toMatch(claim);
  });

  it("not_anchored and broken: says both halves, and still claims nothing of PayPal", () => {
    const sentence = tamperCheck(broken("not_anchored"))!;
    expect(sentence).toContain("do not reproduce the hash recorded with this payment");
    expect(sentence).toContain("No PayPal order holds this hash either");
    for (const claim of PAYPAL_CLAIMS) expect(sentence).not.toMatch(claim);
  });

  it("absent reads as recorded_only, so an older pack never starts claiming corroboration", () => {
    expect(tamperCheck(withHash())).toBe(tamperCheck(withHash("recorded_only")));
    expect(tamperCheck(broken())).toBe(tamperCheck(broken("recorded_only")));
    for (const claim of PAYPAL_CLAIMS) expect(tamperCheck(withHash())!).not.toMatch(claim);
  });

  it("with no hash at all, says there is nothing on PayPal's side to compare against", () => {
    const sentence = tamperCheck({ ...input(emptyBox), payment: null })!;
    expect(sentence).toContain("no payment carries a history hash for this deal");
    expect(sentence).toContain("nothing on PayPal's side to compare against");
    expect(sentence).toContain("hash-chained and internally consistent");
    for (const claim of PAYPAL_CLAIMS) expect(sentence).not.toMatch(claim);
  });

  it("says nothing rather than something weak when there is no hash and no history", () => {
    expect(tamperCheck({ ...input(emptyBox), payment: null, timeline: [] })).toBeNull();
  });

  it("names the broken link when there is no hash and the chain itself does not hold", () => {
    const edited = emptyBox.timeline.map((e, i) => (i === 2 ? { ...e, summary: "edited after the fact" } : e));
    const sentence = tamperCheck({ ...input(emptyBox), payment: null, timeline: edited })!;
    expect(sentence).toContain("do not form an unbroken chain");
    expect(sentence).toContain("the first break is at event 3");
  });

  /**
   * The prompt is the half that bit last time: the facts stopped claiming
   * corroboration and the system prompt put it straight back. So the model is
   * told which case it is in, not merely forbidden a phrase.
   */
  it.each([
    ["corroborated", "PayPal's own copy of the history hash was read back for this pack.", true],
    ["recorded_only", "PayPal's copy of the history hash was NOT read back for this pack.", false],
    ["not_anchored", "No PayPal order holds this hash at all", false],
  ] as const)("tells the model it is in the %s case", async (anchor, expected, mayClaim) => {
    let system = "";
    const client = fakeClaude(() => null);
    client.messages.create = async (params) => {
      system = String(params.system);
      return { content: [{ type: "text", text: "A summary." }], stop_reason: "end_turn" } as never;
    };
    await writeSummary(withHash(anchor), client);
    expect(system).toContain(expected);
    if (!mayClaim) expect(system).toContain("do not say the history was not edited after payment");
    expect(system).not.toContain("official record of the deal that PayPal can check first");
    // Exactly one case line, so two cannot be in the prompt at once.
    const cases = ["was read back for this pack.", "was NOT read back for this pack.", "No PayPal order holds this hash at all"].filter((c) => system.includes(c));
    expect(cases).toHaveLength(1);
  });

  it("an older pack with no anchor gets the conservative prompt", async () => {
    let system = "";
    const client = fakeClaude(() => null);
    client.messages.create = async (params) => {
      system = String(params.system);
      return { content: [{ type: "text", text: "A summary." }], stop_reason: "end_turn" } as never;
    };
    await writeSummary(withHash(), client);
    expect(system).toContain("was NOT read back for this pack.");
  });

  it("the seeded empty-box pack no longer contradicts itself about who holds the hash", () => {
    const summary = deterministicSummary({ ...withHash("not_anchored") });
    for (const claim of PAYPAL_CLAIMS) expect(summary).not.toMatch(claim);
    expect(summary).toContain("No PayPal order holds this hash");
  });
});

describe("deterministicSummary shape", () => {
  it("comes out as short paragraphs in a fixed order, with no markdown", () => {
    const summary = deterministicSummary(input(emptyBox));
    const blocks = summary.split("\n\n");
    expect(blocks.length).toBeGreaterThanOrEqual(6);
    expect(blocks[0]!.startsWith(`Deal ${emptyBox.deal.id}`)).toBe(true);
    expect(blocks[1]!.startsWith("Locked item card, version 1")).toBe(true);
    expect(blocks.some((b) => b.startsWith("Payment: PayPal order"))).toBe(true);
    expect(blocks.some((b) => b.startsWith("Shipping: USPS"))).toBe(true);
    expect(blocks.some((b) => b.startsWith(`${emptyBox.arrivalPhotos.length} arrival photos`))).toBe(true);
    expect(blocks.at(-1)!).toContain("are attached in full.");
    expect(summary).not.toMatch(/\*|`|^#|\n#/);
    // No block is a wall of text.
    for (const block of blocks) expect(block.length).toBeLessThan(700);
  });

  it("keeps the review and ship-time sentences in their own paragraph", () => {
    const summary = deterministicSummary(input(emptyBox));
    const review = summary.split("\n\n").find((b) => b.includes("The Buyer Pal asked the seller before payment"))!;
    expect(review).toBeDefined();
    expect(review).toContain("The seller never answered.");
    expect(review).not.toContain("Payment:");
    const shipping = summary.split("\n\n").find((b) => b.startsWith("Shipping:"))!;
    expect(shipping).toContain("At ship time the Buyer Pal raised MISSING_PACKING_PHOTO");
  });

  it("clean-ps5 has no review or arrival paragraph to show", () => {
    const summary = deterministicSummary({ ...input(cleanPs5), arrivalPhotos: [] });
    expect(summary).not.toContain("never answered");
    expect(summary).not.toContain("Arrival check");
    expect(summary.split("\n\n")[0]!.startsWith(`Deal ${cleanPs5.deal.id}`)).toBe(true);
  });
});

describe("writeSummary with a model", () => {
  it("strips a markdown heading and the markers, and keeps the paragraph breaks", async () => {
    const prose = [
      "**Summary**",
      "",
      "The buyer paid for a PlayStation 5, serial " + EMPTY_BOX_LOCKED_SERIAL + ".",
      "",
      "* The box arrived with only a foam insert.",
      "* The seller shipped without the packing photo.",
    ].join("\n");
    const summary = await writeSummary(input(emptyBox), proseClient(prose));
    expect(summary).not.toContain("*");
    expect(summary).not.toContain("Summary");
    expect(summary.split("\n\n")[0]).toBe(`The buyer paid for a PlayStation 5, serial ${EMPTY_BOX_LOCKED_SERIAL}.`);
    expect(summary).toContain("The box arrived with only a foam insert.\nThe seller shipped without the packing photo.");
  });

  it("asks the model for paragraphs and no markdown", async () => {
    let system = "";
    const client = fakeClaude(() => null);
    client.messages.create = async (params) => {
      system = typeof params.system === "string" ? params.system : "";
      return { content: [{ type: "text", text: "Plain prose." }], stop_reason: "end_turn" } as never;
    };
    await writeSummary(input(emptyBox), client);
    expect(system).toContain("short paragraphs separated by a blank line");
    expect(system).toContain("No title, no heading, no markdown");
  });

  it("the history hash ends its sentence, whichever way it was written", async () => {
    const head = "7c".repeat(32);
    const withHash: EvidenceInput = { ...input(emptyBox), payment: { ...emptyBox.payment!, historyHash: head } };
    // The deterministic summary already puts the hash at the end of its sentence.
    expect(deterministicSummary(withHash)).toContain(`The hash is ${head}.`);
    // A model that writes it inline gets it moved, because the page prints a hash on its own line.
    const prose = `A tamper check compared the deal history hash recorded on the PayPal order at payment time, ${head}, against the 20 stored timeline events.`;
    const summary = await writeSummary(withHash, proseClient(prose));
    expect(summary).toBe(`A tamper check compared the deal history hash recorded on the PayPal order at payment time against the 20 stored timeline events: ${head}.`);
    expect(summary).not.toContain(`${head},`);
    expect(summary.trimEnd().endsWith(`${head}.`)).toBe(true);
  });

  it("tells the model where the hash goes", async () => {
    let system = "";
    const client = fakeClaude(() => null);
    client.messages.create = async (params) => {
      system = typeof params.system === "string" ? params.system : "";
      return { content: [{ type: "text", text: "Plain prose." }], stop_reason: "end_turn" } as never;
    };
    await writeSummary(input(emptyBox), client);
    expect(system).toContain("Put the 64-character history hash at the end of its sentence");
  });

  it("drops only a bare heading line", () => {
    expect(dropHeadingLine("Summary\n\nThe deal.")).toBe("The deal.");
    expect(dropHeadingLine("Summary:\nThe deal.")).toBe("The deal.");
    expect(dropHeadingLine("Summary of the deal\n\nThe deal.")).toBe("Summary of the deal\n\nThe deal.");
    expect(dropHeadingLine("Summary")).toBe("Summary");
  });
});
