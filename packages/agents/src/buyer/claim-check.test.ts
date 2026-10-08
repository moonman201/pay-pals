import { describe, expect, it } from "vitest";
import { NOT_CHECKED_EXPLANATION } from "../cert/compare";
import { reaskInstruction, unfoundedClaims } from "./claim-check";

const notChecked = { matches: null, explanation: NOT_CHECKED_EXPLANATION, record: { provider: "fixture" as const, certNumber: "49172834", subject: null, grade: null, year: null, brand: null, raw: { notChecked: true }, checkedAt: new Date().toISOString() } };

describe("unfoundedClaims", () => {
  it("catches photo claims when no image was read and allows them when one was", () => {
    const text = "The serial on the console photo matches the box label, which is a strong sign this is a real, working unit and not a stock photo listing. I can see light wear.";
    const claims = unfoundedClaims(text, { imagesRead: false, psaContacted: false, certCheck: null });
    expect(claims).toContain("stock photo");
    expect(claims).toContain("real, working unit");
    expect(claims).toContain("I can see");
    expect(unfoundedClaims(text, { imagesRead: true, psaContacted: false, certCheck: null })).toEqual([]);
  });
  it("lets caption talk and photo requests through", () => {
    const text = "The seller's caption says the back of the console shows serial AH912345678. Ask for a photo of the settings screen before you pay.";
    expect(unfoundedClaims(text, { imagesRead: false, psaContacted: false, certCheck: null })).toEqual([]);
  });
  it("catches PSA database talk when PSA was not contacted, and PSA findings when the cert was not checked", () => {
    const text = "When we checked PSA's own database with the cert number given, PSA has no record of it.";
    const claims = unfoundedClaims(text, { imagesRead: true, psaContacted: false, certCheck: notChecked });
    expect(claims).toContain("PSA's own database");
    expect(claims).toContain("PSA has no record");
    expect(unfoundedClaims("PSA confirms cert 12345678: 1999 POKEMON GAME CHARIZARD-HOLO #4, grade GEM MT 10.", { imagesRead: true, psaContacted: true, certCheck: { ...notChecked, matches: true } })).toEqual([]);
    expect(unfoundedClaims(NOT_CHECKED_EXPLANATION, { imagesRead: true, psaContacted: false, certCheck: notChecked })).toEqual([]);
  });
  it("writes a re-ask that names the phrases and the reasons", () => {
    const text = reaskInstruction(["stock photo"], { imagesRead: false, psaContacted: false, certCheck: notChecked });
    expect(text).toContain('"stock photo"');
    expect(text).toContain("no photo was looked at");
    expect(text).toContain("PSA was not contacted");
    expect(text).toContain(NOT_CHECKED_EXPLANATION);
  });
});
