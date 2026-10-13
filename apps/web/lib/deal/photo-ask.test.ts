import { cleanPs5, emptyBox, fakeSlab, type Photo } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { packingAsks, photoAsk } from "./photo-ask";

const photo = (whatItShows: string): Photo => ({ url: `/p/${whatItShows.length}.jpg`, whatItShows, addedBy: "seller", addedAt: "2026-10-11T00:00:00.000Z" });

const closeUp = photo("Close-up of the label on the back of the console. The barcode is readable and the number under it is AJ164952580.");
const boxLabel = photo("Registration label on a PlayStation 5 box, torn open along the top.");

describe("photoAsk", () => {
  it("picks the demo close-up for a close-up of the serial label", () => {
    const got = photoAsk(["Can you send a close-up of the serial label on the console?"], [boxLabel, closeUp]);
    expect(got?.photo).toBe(closeUp);
  });

  it("asks for the photo and offers no demo photo when none answers it", () => {
    const got = photoAsk(["Can you photograph the slab next to a handwritten note with your name and today's date?"], [closeUp, boxLabel]);
    expect(got).not.toBeNull();
    expect(got?.photo).toBeNull();
  });

  it("ignores a question that is not about a photo", () => {
    expect(photoAsk(["Will you take $400?"], [closeUp])).toBeNull();
    expect(photoAsk([], [closeUp])).toBeNull();
  });

  it("takes the first picture question, not the first question", () => {
    expect(photoAsk(["Will you take $400?", "Can you send a close-up of the serial label?"], [closeUp])?.ask).toMatch(/close-up/);
  });
});

describe("packingAsks", () => {
  it("lists only the required photo steps", () => {
    const asks = packingAsks(cleanPs5.shipment!.checklist, cleanPs5.shipment!.packingPhotos);
    expect(asks.map((a) => a.item.id)).toEqual(["c1", "c2"]);
    expect(asks.every((a) => a.photo !== null)).toBe(true);
  });

  it("matches the sealed box photo to a taped-shut description", () => {
    const [, sealed] = packingAsks(cleanPs5.shipment!.checklist, cleanPs5.shipment!.packingPhotos);
    expect(sealed!.photo?.whatItShows).toMatch(/taped shut/);
  });

  it("empty-box: no demo photo goes into the box, so the seller is told to take one", () => {
    const asks = packingAsks(emptyBox.shipment!.checklist, emptyBox.shipment!.packingPhotos);
    const goingIn = asks.find((a) => a.item.id === "c1");
    expect(goingIn?.photo).toBeNull();
  });

  it("fake-slab: the dated note has no demo photo, whatever the fixture holds", () => {
    const allPhotos = fakeSlab.cards.flatMap((c) => c.photos);
    expect(photoAsk(["Can you photograph the slab next to a handwritten note with your name and today's date?"], allPhotos)?.photo).toBeNull();
  });
});
