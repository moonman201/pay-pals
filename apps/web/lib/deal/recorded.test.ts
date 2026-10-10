import { cleanPs5, emptyBox, type Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { recordedByPayPals, type RecordedInput } from "./recorded";

const empty: RecordedInput = { cards: [], lockedVersion: null, messages: [], verdicts: [], arrivalCheck: null, shipment: null };

const verdict: Verdict = {
  dealId: "d",
  cardVersion: 1,
  overall: "go",
  flags: [],
  priceCheck: cleanPs5.marketPrice,
  questionsForSeller: [],
  palMessage: "Looks fine.",
  createdAt: "2026-10-09T00:00:00.000Z",
};

function value(input: RecordedInput, label: string): string {
  return recordedByPayPals(input).find((l) => l.label === label)!.value;
}

describe("recordedByPayPals", () => {
  it("always has the same four lines, so the panel keeps its shape", () => {
    expect(recordedByPayPals(empty).map((l) => l.label)).toEqual(["Item card", "Photos", "Chat", "Pal checks"]);
  });

  it("says plainly that an empty deal has nothing yet", () => {
    expect(value(empty, "Item card")).toBe("No item card yet.");
    expect(value(empty, "Photos")).toBe("None.");
    expect(value(empty, "Chat")).toBe("0 shared messages, 0 pal messages.");
    expect(value(empty, "Pal checks")).toBe("None yet.");
  });

  it("names the locked version and keeps the count of versions", () => {
    const input: RecordedInput = { ...empty, cards: cleanPs5.cards, lockedVersion: cleanPs5.deal.lockedCardVersion ?? null };
    expect(value(input, "Item card")).toBe(`Version ${cleanPs5.deal.lockedCardVersion}, locked. ${cleanPs5.cards.length} versions kept.`);
  });

  it("says a card is still open to change when nothing is locked", () => {
    expect(value({ ...empty, cards: [cleanPs5.cards[0]!] }, "Item card")).toBe("Version 1, still open to change. 1 version kept.");
  });

  it("counts a photo once however many card versions carry it", () => {
    const urls = new Set(cleanPs5.cards.flatMap((c) => c.photos.map((p) => p.url)));
    expect(value({ ...empty, cards: cleanPs5.cards }, "Photos")).toBe(`${urls.size} photos on the item card.`);
  });

  it("counts the packing and arrival photos separately", () => {
    const input: RecordedInput = { ...empty, cards: emptyBox.cards, shipment: { ...emptyBox.shipment!, dealId: "d" } };
    expect(value(input, "Photos")).toContain(`${emptyBox.shipment!.packingPhotos.length} packing`);
  });

  it("counts shared and pal messages apart, never one lump", () => {
    const messages = emptyBox.chat.map((m, i) => ({ ...m, id: `m${i}`, dealId: "d" }));
    const shared = messages.filter((m) => m.channel === "deal").length;
    expect(value({ ...empty, messages }, "Chat")).toBe(`${shared} shared messages, ${messages.length - shared} pal messages.`);
  });

  it("names the pal checks that exist and nothing else", () => {
    const input: RecordedInput = {
      ...empty,
      verdicts: [verdict],
      shipment: { ...emptyBox.shipment!, dealId: "d" },
      arrivalCheck: null,
    };
    const line = value(input, "Pal checks");
    expect(line).toContain("1 Buyer Pal review");
    expect(line).toContain("a ship-time check");
    expect(line).not.toContain("an arrival check");
  });

  it("adds the button the buyer pressed, with the Goods and Services sentence", () => {
    expect(value({ ...empty, method: "venmo" }, "Button the buyer pressed")).toBe("Venmo. Pay Pals only ever creates a Goods and Services checkout order.");
    expect(recordedByPayPals({ ...empty, method: null }).some((l) => l.label === "Button the buyer pressed")).toBe(false);
  });
});
