import { describe, expect, it } from "vitest";
import { ItemCardSchema, isLocked, toPaypalAmount } from "./item-card";
import { cleanPs5 } from "./fixtures";

describe("item card", () => {
  it("formats prices for PayPal", () => {
    expect(toPaypalAmount(475)).toBe("475.00");
    expect(toPaypalAmount(475.5)).toBe("475.50");
  });

  it("rejects a card with a bad payee email", () => {
    const bad = { ...cleanPs5.cards[0]!, sellerPaypalEmail: "not-an-email" };
    expect(ItemCardSchema.safeParse(bad).success).toBe(false);
  });

  it("knows when a card is locked", () => {
    expect(isLocked(cleanPs5.cards[0]!)).toBe(false);
    expect(isLocked(cleanPs5.cards[1]!)).toBe(true);
  });
});
