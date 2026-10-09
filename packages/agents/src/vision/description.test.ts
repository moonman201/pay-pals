import { describe, expect, it } from "vitest";
import { CLEAN_SERIAL, FAKE_SLAB_CERT, cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { brandFromText, certFromText, gradeFromText, isPackagingDescription, modelFamily, modelFromText, normalizeSerial, saysItemMissing, serialFromText } from "./description";

const consoleBack = cleanPs5.cards[0]!.photos[0]!.whatItShows;
const boxLabel = cleanPs5.cards[0]!.photos[1]!.whatItShows;
const laidOut = cleanPs5.cards[0]!.photos[2]!.whatItShows;
const closeUp = cleanPs5.cards[1]!.photos[3]!.whatItShows;
const arrivalBoxLabel = emptyBox.arrivalPhotos[1]!.whatItShows;
const openBox = emptyBox.arrivalPhotos[0]!.whatItShows;
const slabFront = fakeSlab.cards[0]!.photos[0]!.whatItShows;

describe("serialFromText", () => {
  it("reads the number a caption ties to a label, a barcode or a close-up", () => {
    expect(serialFromText(boxLabel)).toBe(CLEAN_SERIAL);
    expect(serialFromText(closeUp)).toBe(CLEAN_SERIAL);
    expect(serialFromText(arrivalBoxLabel)).toBe(CLEAN_SERIAL);
    expect(serialFromText("Back of the console. Serial AJ164952580 under the barcode.")).toBe(CLEAN_SERIAL);
    expect(serialFromText("S/N: ab-12-cd-34")).toBe("AB12CD34");
  });
  it("reads the phrasings a person actually writes", () => {
    expect(serialFromText("The number under the barcode is AJ164952580.")).toBe(CLEAN_SERIAL);
    expect(serialFromText("The label reads AJ164952580 beside the barcode.")).toBe(CLEAN_SERIAL);
    expect(serialFromText("Registration sticker, AJ164952580, on the back.")).toBe(CLEAN_SERIAL);
    expect(serialFromText("Close-up of the barcode with AJ164952580 printed under it.")).toBe(CLEAN_SERIAL);
  });
  it("does not mistake the model code in a wide shot for a serial", () => {
    expect(consoleBack).toContain("too small in this shot to read");
    expect(serialFromText(consoleBack)).toBeNull();
    expect(serialFromText(laidOut)).toBeNull();
    expect(serialFromText(openBox)).toBeNull();
    expect(serialFromText("Serial is on the box label, photo attached.")).toBeNull();
  });
});

describe("cert and grade", () => {
  it("reads the cert number and the grade off a slab label", () => {
    expect(certFromText(slabFront)).toBe(FAKE_SLAB_CERT);
    expect(gradeFromText(slabFront)).toBe("GEM MT 10");
    expect(gradeFromText("Gengar & Mimikyu GX Tag Bolt PSA 10, Japanese.")).toBe("PSA 10");
    expect(gradeFromText("BGS 9.5 Black Label")).toBe("BGS 9.5");
    expect(certFromText("Cert number 72096346 is on the label.")).toBe(FAKE_SLAB_CERT);
  });
  it("does not invent a cert or a grade", () => {
    expect(certFromText("Cert is right there on the label if you want to look it up.")).toBeNull();
    expect(certFromText("The number 72096346 with no grade anywhere.")).toBeNull();
    expect(gradeFromText(boxLabel)).toBeNull();
  });
});

describe("model and brand parsing", () => {
  it("finds the product family and number", () => {
    expect(modelFamily(cleanPs5.cards[0]!.model)).toEqual({ family: "PlayStation", number: "5" });
    expect(modelFamily("Disc edition")).toBeNull();
  });
  it("spots a different number in the same family", () => {
    expect(modelFromText("Label reads PlayStation 4 Pro, serial 0123456789.", cleanPs5.cards[0]!.model)).toBe("PlayStation 4 Pro");
    expect(modelFromText("Back of the console as received.", cleanPs5.cards[0]!.model)).toBeNull();
  });
  it("matches the brand only when it is named", () => {
    expect(brandFromText(consoleBack, "Sony")).toBe("Sony");
    expect(brandFromText(closeUp, "Sony")).toBeNull();
  });
  it("normalizes serials for comparison", () => {
    expect(normalizeSerial("aj 164-952580")).toBe(CLEAN_SERIAL);
  });
});

describe("packaging and missing item", () => {
  it("tells a box label from the item's own label", () => {
    expect(isPackagingDescription(boxLabel)).toBe(true);
    expect(isPackagingDescription(arrivalBoxLabel)).toBe(true);
    expect(isPackagingDescription(closeUp)).toBe(false);
    expect(isPackagingDescription(consoleBack)).toBe(false);
  });
  it("reads an empty box from the words a person uses for one", () => {
    expect(saysItemMissing("Box arrived empty.")).toBe(true);
    expect(saysItemMissing("Only the foam insert inside, no console.")).toBe(true);
    // Two foam inserts with nothing between them is how the empty box reads.
    expect(openBox).toContain("Nothing between them");
    expect(saysItemMissing(openBox)).toBe(true);
  });
  it("does not call a box with the item in it empty", () => {
    expect(saysItemMissing(laidOut)).toBe(false);
    expect(saysItemMissing(closeUp)).toBe(false);
    expect(saysItemMissing(cleanPs5.shipment!.packingPhotos[0]!.whatItShows)).toBe(false);
    expect(saysItemMissing(arrivalBoxLabel)).toBe(false);
  });
});
