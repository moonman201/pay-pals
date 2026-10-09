import { describe, expect, it } from "vitest";
import { RedFlagSchema, cleanPs5, emptyBox } from "@pay-pals/contracts";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { createBuyerPal } from "./buyer-pal";
import { MISSING_PHOTO_EXPLANATION, NO_PACKING_PHOTOS_EVIDENCE } from "./shipment";

const pal = createBuyerPal({ anthropic: null, priceLookup: createFixturePriceLookup() });

describe("BuyerPal.checkShipment", () => {
  it("empty-box: the skipped packing photo raises one MISSING_PACKING_PHOTO caution with the exact wording", async () => {
    const { data: flags, palMessage } = await pal.checkShipment(emptyBox.cards[0]!, emptyBox.shipment!);
    expect(flags).toHaveLength(1);
    expect(RedFlagSchema.safeParse(flags[0]).success).toBe(true);
    expect(flags[0]).toEqual({
      code: "MISSING_PACKING_PHOTO",
      severity: "caution",
      evidence: "Packing step not done: Photo of the console, controller and cables going into the box",
      explanation: MISSING_PHOTO_EXPLANATION,
      raisedByRule: true,
    });
    // The fixture's seeded flag matches on everything but the wording of the evidence, which the Lead updates.
    const seeded = emptyBox.shipment!.flags![0]!;
    expect(flags[0]).toMatchObject({ code: seeded.code, severity: seeded.severity, explanation: seeded.explanation, raisedByRule: true });
    expect(palMessage).toContain("One required packing step is missing: Photo of the console, controller and cables going into the box.");
    expect(palMessage).toContain("USPS, tracking 9400100000000000000002");
  });

  it("clean-ps5: every step done and photos present means no flag", async () => {
    const { data: flags, palMessage } = await pal.checkShipment(cleanPs5.cards[1]!, cleanPs5.shipment!);
    expect(flags).toEqual([]);
    expect(palMessage).toContain("The seller shipped with every packing photo.");
  });

  it("flags an empty packing photo list even when the checklist is ticked, and a skipped non-photo step", async () => {
    const ticked = { ...cleanPs5.shipment!, packingPhotos: [] };
    const { data: noPhotos, palMessage } = await pal.checkShipment(cleanPs5.cards[1]!, ticked);
    expect(noPhotos).toHaveLength(1);
    expect(noPhotos[0]).toMatchObject({ code: "MISSING_PACKING_PHOTO", severity: "caution", evidence: NO_PACKING_PHOTOS_EVIDENCE, explanation: MISSING_PHOTO_EXPLANATION });
    expect(palMessage).toContain("No packing photos were added.");

    const noTracking = { ...cleanPs5.shipment!, checklist: cleanPs5.shipment!.checklist.map((c) => (c.id === "c3" ? { ...c, done: false } : c)) };
    const { data: step } = await pal.checkShipment(cleanPs5.cards[1]!, noTracking);
    expect(step).toHaveLength(1);
    expect(step[0]!.evidence).toBe("Packing step not done: Enter the carrier and tracking number");
    expect(step[0]!.explanation).toContain("without finishing a required step");
  });

  it("does not double count a skipped photo step when the photo list is also empty", async () => {
    const both = { ...emptyBox.shipment!, packingPhotos: [] };
    const { data: flags } = await pal.checkShipment(emptyBox.cards[0]!, both);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.evidence).toContain("Packing step not done:");
  });
});
