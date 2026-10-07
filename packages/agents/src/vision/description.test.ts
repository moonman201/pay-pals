import { describe, expect, it } from "vitest";
import { brandFromText, isPackagingDescription, modelFamily, modelFromText, normalizeSerial, saysItemMissing, serialFromText } from "./description";

describe("serialFromText", () => {
  it("reads serials written several ways", () => {
    expect(serialFromText("Back of the console. Serial AH912345678 and model CFI-1215A on the label.")).toBe("AH912345678");
    expect(serialFromText("Original box label. Serial AJ204567113, model CFI-1215A.")).toBe("AJ204567113");
    expect(serialFromText("S/N: ab-12-cd-34")).toBe("AB12CD34");
    expect(serialFromText("serial number is 123456")).toBe("123456");
  });
  it("does not invent a serial from words", () => {
    expect(serialFromText("Serial is on the back of the console and on the box label, photos of both attached.")).toBeNull();
    expect(serialFromText("Console standing next to its open box with the controller and cables.")).toBeNull();
    expect(serialFromText("serial visible but blurry")).toBeNull();
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
  it("tells a box label from the item", () => {
    expect(isPackagingDescription("Original box label. Serial AJ204567113.")).toBe(true);
    expect(isPackagingDescription("Label on the box that arrived. Serial AJ204567113.")).toBe(true);
    expect(isPackagingDescription("Back of the console. Serial AH912345678 and model CFI-1215A on the label.")).toBe(false);
    expect(isPackagingDescription("Console Information screen on the TV showing serial AH912345678.")).toBe(false);
  });
  it("notices when the photo says the item is not there", () => {
    expect(saysItemMissing("The original box opened on arrival. Only the foam insert inside. No console, no controller, no cables.")).toBe(true);
    expect(saysItemMissing("Box arrived empty.")).toBe(true);
    expect(saysItemMissing("Back of the console as received. Serial AH912345678.")).toBe(false);
    expect(saysItemMissing("Console standing next to its open box with the controller and cables.")).toBe(false);
  });
});
