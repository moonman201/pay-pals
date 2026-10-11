/**
 * The drift qa found on 2026-10-11 is the case this file exists to stop:
 * "This proves the seller owns the item" was forbidden in a Markdown file and
 * allowed in a React component, because two tables of the same policy had
 * grown apart. These tests pin the sentences that caught it.
 */
import { describe, expect, it } from "vitest";
import { WITHDRAWN_CLAIMS, withdrawnClaimsIn } from "./withdrawn-claims";

describe("the claims this product has withdrawn", () => {
  it("covers all four of Matt's items, once each", () => {
    expect(WITHDRAWN_CLAIMS.map((c) => c.id)).toEqual(["D8", "D9", "D10", "D11"]);
  });

  it("every claim says why and what to say instead, because a guard prints both", () => {
    for (const claim of WITHDRAWN_CLAIMS) {
      expect(claim.why.length, claim.id).toBeGreaterThan(20);
      expect(claim.instead.length, claim.id).toBeGreaterThan(20);
      expect(claim.patterns.length, claim.id).toBeGreaterThan(0);
    }
  });

  // The exact sentence that was forbidden in one guard and allowed in another.
  it("catches the ownership claim in both of the forms the two tables had grown apart on", () => {
    expect(withdrawnClaimsIn("This proves the seller owns the item.").map((c) => c.id)).toEqual(["D9"]);
    expect(withdrawnClaimsIn("A matching cert proves ownership.").map((c) => c.id)).toEqual(["D9"]);
    expect(withdrawnClaimsIn("That proves he has it.").map((c) => c.id)).toEqual(["D9"]);
  });

  it("catches the other three", () => {
    expect(withdrawnClaimsIn("The seller refused, which is the strongest sign of a scam.").map((c) => c.id)).toEqual(["D8"]);
    expect(withdrawnClaimsIn("Attach the pack and you will get your money back.").map((c) => c.id)).toEqual(["D10"]);
    expect(withdrawnClaimsIn("A refund requires the history hash.").map((c) => c.id)).toEqual(["D11"]);
  });

  it("leaves honest sentences alone, including the ones that nearly read like a claim", () => {
    for (const ok of [
      "A matching serial supports the listing. It is not a check that the seller owns the item.",
      "The market range is drawn from 3 listings.",
      "This pack is useful context for a PayPal dispute, which PayPal decides under its own terms.",
      "The chain is the official record of the deal that PayPal can check first.",
    ]) {
      expect(withdrawnClaimsIn(ok), ok).toEqual([]);
    }
  });
});

/**
 * A page cannot exempt itself the way a Markdown file can, because the honest
 * sentence and the claim it denies sit in the same document. qa hit this on the
 * page guard's first run against the slab room, which says exactly the thing D9
 * asks for and so contains the phrase D9 forbids.
 */
describe("a denial is not a claim", () => {
  it("allows the sentence D9 asks for, which the slab room actually prints", () => {
    expect(withdrawnClaimsIn("Cert 72096346 matches PSA's record. The slab exists. That doesn't prove the seller has it.")).toEqual([]);
  });

  it("allows the other denials the product writes", () => {
    for (const ok of [
      "A matching serial does not prove ownership.",
      "This is never proof of fraud.",
      "Nothing here proves the seller owns the item.",
      "It is not the strongest sign of a scam, it is a risk signal.",
      "This pack does not guarantee a refund.",
    ]) {
      expect(withdrawnClaimsIn(ok), ok).toEqual([]);
    }
  });

  it("still catches a bare claim that happens to sit near a denial", () => {
    // The negator follows the claim rather than denying it.
    expect(withdrawnClaimsIn("We guarantee a refund, and this is not a scam.").map((c) => c.id)).toEqual(["D10"]);
    // One honest denial does not excuse a second, bare claim later.
    expect(
      withdrawnClaimsIn("A matching cert does not prove ownership. Our check proves ownership.").map((c) => c.id),
    ).toEqual(["D9"]);
  });

  it("does not let a denial three sentences earlier launder a later claim", () => {
    expect(
      withdrawnClaimsIn("This does not prove much. The cert is real. The photo is sharp. A match proves ownership.").map((c) => c.id),
    ).toEqual(["D9"]);
  });
});
