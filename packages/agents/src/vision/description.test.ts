import { describe, expect, it } from "vitest";
import { brandFromText, modelFamily, modelFromText, normalizeSerial, serialFromText } from "./description";

describe("serialFromText", () => {
  it("reads serials written several ways", () => {
    expect(serialFromText("Back of the watch. Serial 7LP045912 visible under the sensor.")).toBe("7LP045912");
    expect(serialFromText("Reads Fenix 6, serial 6XR118204.")).toBe("6XR118204");
    expect(serialFromText("S/N: ab-12-cd-34")).toBe("AB12CD34");
    expect(serialFromText("serial number is 123456")).toBe("123456");
  });
  it("does not invent a serial from words", () => {
    expect(serialFromText("Serial is on the back, photo attached.")).toBeNull();
    expect(serialFromText("Front of the watch on the wrist.")).toBeNull();
    expect(serialFromText("serial visible but blurry")).toBeNull();
  });
});

describe("model and brand parsing", () => {
  it("finds the product family and number", () => {
    expect(modelFamily("Fenix 7 Pro Solar 47mm")).toEqual({ family: "Fenix", number: "7" });
    expect(modelFamily("Sapphire Solar")).toBeNull();
  });
  it("spots a different number in the same family", () => {
    expect(modelFromText("Reads Fenix 6, serial 6XR118204.", "Fenix 7 Pro Solar 47mm")).toBe("Fenix 6");
    expect(modelFromText("Back of the watch as received.", "Fenix 7 Pro Solar 47mm")).toBeNull();
  });
  it("matches the brand only when it is named", () => {
    expect(brandFromText("Garmin caseback", "Garmin")).toBe("Garmin");
    expect(brandFromText("caseback", "Garmin")).toBeNull();
  });
  it("normalizes serials for comparison", () => {
    expect(normalizeSerial("6xr 118-204")).toBe("6XR118204");
  });
});
