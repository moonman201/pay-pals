import { describe, expect, it } from "vitest";
import type { EvidenceInput } from "@pay-pals/contracts";
import { EMPTY_BOX_LOCKED_SERIAL, cleanPs5, emptyBox } from "@pay-pals/contracts";
import { fakeClaude } from "../testing/fake-claude";
import { dropHeadingLine, deterministicSummary, writeSummary } from "./summary";

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

  it("drops only a bare heading line", () => {
    expect(dropHeadingLine("Summary\n\nThe deal.")).toBe("The deal.");
    expect(dropHeadingLine("Summary:\nThe deal.")).toBe("The deal.");
    expect(dropHeadingLine("Summary of the deal\n\nThe deal.")).toBe("Summary of the deal\n\nThe deal.");
    expect(dropHeadingLine("Summary")).toBe("Summary");
  });
});
