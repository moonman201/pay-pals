import { describe, expect, it } from "vitest";
import { brandFromText, certFromText, gradeFromText, isPackagingDescription, modelFamily, modelFromText, normalizeSerial, saysItemMissing, serialFromText } from "./description";

describe("serialFromText", () => {
  it("reads serials written several ways, including the fixture captions", () => {
    expect(serialFromText("Back of a white PlayStation 5 console. The label shows serial AH912345678 and model CFI-1215A.")).toBe("AH912345678");
    expect(serialFromText("Barcode label on a PlayStation 5 box. Serial AJ204567113.")).toBe("AJ204567113");
    expect(serialFromText("TV screen showing the PlayStation Console Information page. Serial AH912345678, system software version listed.")).toBe("AH912345678");
    expect(serialFromText("S/N: ab-12-cd-34")).toBe("AB12CD34");
    expect(serialFromText("serial number is 123456")).toBe("123456");
  });
  it("does not invent a serial from words", () => {
    expect(serialFromText("Serial is on the back of the console and on the box label, photos of both attached.")).toBeNull();
    expect(serialFromText("White PlayStation 5 standing next to its open box, with a controller and two cables.")).toBeNull();
    expect(serialFromText("serial visible but blurry")).toBeNull();
  });
});

describe("cert and grade", () => {
  it("reads a cert number and a grade from a slab label or listing", () => {
    expect(certFromText("Label reads 1999 POKEMON GAME CHARIZARD-HOLO #4, GEM MT 10, cert 81234567.")).toBe("81234567");
    expect(certFromText("Cert number is on the label.")).toBeNull();
    expect(gradeFromText("1999 Pokemon Base Set Charizard Holo PSA 10. Gem mint.")).toBe("PSA 10");
    expect(gradeFromText("BGS 9.5 Black Label")).toBe("BGS 9.5");
    expect(gradeFromText("Front of a PSA slab on a wooden table.")).toBeNull();
  });
});

describe("model and brand parsing", () => {
  it("finds the product family and number", () => {
    expect(modelFamily("PlayStation 5 disc edition, CFI-1215A")).toEqual({ family: "PlayStation", number: "5" });
    expect(modelFamily("Disc edition")).toBeNull();
  });
  it("spots a different number in the same family", () => {
    expect(modelFromText("Label reads PlayStation 4 Pro, serial 0123456789.", "PlayStation 5 disc edition, CFI-1215A")).toBe("PlayStation 4 Pro");
    expect(modelFromText("Back of the console as received.", "PlayStation 5 disc edition, CFI-1215A")).toBeNull();
  });
  it("matches the brand only when it is named", () => {
    expect(brandFromText("Sony label on the back", "Sony")).toBe("Sony");
    expect(brandFromText("label on the back", "Sony")).toBeNull();
  });
  it("normalizes serials for comparison", () => {
    expect(normalizeSerial("aj 204-567113")).toBe("AJ204567113");
  });
});

describe("packaging and missing item", () => {
  it("tells a box label from the item in the fixture captions", () => {
    expect(isPackagingDescription("Barcode label on a PlayStation 5 box. Serial AJ204567113.")).toBe(true);
    expect(isPackagingDescription("Barcode label on the box that arrived. Serial AJ204567113.")).toBe(true);
    expect(isPackagingDescription("Back of a white PlayStation 5 console. The label shows serial AH912345678 and model CFI-1215A.")).toBe(false);
    expect(isPackagingDescription("TV screen showing the PlayStation Console Information page. Serial AH912345678, system software version listed.")).toBe(false);
  });
  it("only says the item is missing when the words say so; a caption of a box with foam does not", () => {
    expect(saysItemMissing("Box arrived empty.")).toBe(true);
    expect(saysItemMissing("Only the foam insert inside, no console.")).toBe(true);
    expect(saysItemMissing("PlayStation 5 box opened on a table. Grey foam insert inside.")).toBe(false);
    expect(saysItemMissing("White PlayStation 5 standing next to its open box, with a controller and two cables.")).toBe(false);
  });
});
