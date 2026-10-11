import { buildCustomId, cleanPs5, type PaymentRecord } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { anchorCopy, anchorOf, historyAnchorFor } from "./history-anchor";
import { readOrderFields, type PayPalReadResult } from "./paypal-confirmation";

const HEAD = "a".repeat(64);
const payment: PaymentRecord = { ...cleanPs5.payment!, paypalOrderId: "2NW245573K1279237", historyHash: HEAD };

function confirmed(customId: string | null): PayPalReadResult {
  return { kind: "confirmed", order: readOrderFields({ id: "2NW245573K1279237", status: "COMPLETED", purchase_units: [customId ? { custom_id: customId } : {}] }) };
}

describe("historyAnchorFor", () => {
  it("is corroborated only when PayPal's own copy was read and carries the same hash", () => {
    expect(historyAnchorFor(confirmed(buildCustomId("d1", HEAD)), payment)).toBe("corroborated");
  });

  it("is not anchored when PayPal's copy carries a different hash", () => {
    expect(historyAnchorFor(confirmed(buildCustomId("d1", "f".repeat(64))), payment)).toBe("not_anchored");
  });

  it("is not anchored when PayPal's order carries no hash at all", () => {
    expect(historyAnchorFor(confirmed("d1"), payment)).toBe("not_anchored");
    expect(historyAnchorFor(confirmed(null), payment)).toBe("not_anchored");
  });

  it("is recorded only when a real order exists and the read did not come back", () => {
    expect(historyAnchorFor({ kind: "failed" }, payment)).toBe("recorded_only");
  });

  it("is not anchored for a seeded example deal or the mock gateway, whose ids are placeholders", () => {
    expect(historyAnchorFor({ kind: "example" }, cleanPs5.payment!)).toBe("not_anchored");
    expect(historyAnchorFor({ kind: "mock" }, { ...payment, paypalOrderId: "DEMO-1A2B3C4D" })).toBe("not_anchored");
  });

  it("is not anchored when there is no payment at all", () => {
    for (const read of [{ kind: "none" }, { kind: "failed" }, confirmed(buildCustomId("d1", HEAD))] as PayPalReadResult[]) {
      expect(historyAnchorFor(read, null), read.kind).toBe("not_anchored");
    }
  });

  it("is not anchored when we never recorded a hash, whatever the read says", () => {
    const noHash = { ...payment, historyHash: null };
    expect(historyAnchorFor({ kind: "failed" }, noHash)).toBe("not_anchored");
    expect(historyAnchorFor(confirmed(buildCustomId("d1", HEAD)), noHash)).toBe("not_anchored");
  });

  it("never reads the shape of an order id, which is a convention and not a contract", () => {
    // A FIXTURE- id with a live read that agrees is corroborated; the prefix decides nothing.
    const fixtureId = { ...payment, paypalOrderId: "FIXTURE-ORDER-CLEAN-0001" };
    expect(historyAnchorFor(confirmed(buildCustomId("d1", HEAD)), fixtureId)).toBe("corroborated");
    // And a perfectly ordinary id with no read is still only our own record.
    expect(historyAnchorFor({ kind: "failed" }, payment)).toBe("recorded_only");
  });
});

describe("anchorOf", () => {
  it("reads an absent value as the conservative case, which never claims corroboration", () => {
    expect(anchorOf(undefined)).toBe("recorded_only");
    expect(anchorCopy(undefined, null).corroborated).toBe(false);
  });
});

describe("anchorCopy", () => {
  it("claims PayPal corroborated it only for corroborated", () => {
    expect(anchorCopy("corroborated", "2NW245573K1279237").corroborated).toBe(true);
    expect(anchorCopy("corroborated", "2NW245573K1279237").text).toMatch(/corroborated by PayPal, not only by us/);
    for (const anchor of ["recorded_only", "not_anchored"] as const) {
      expect(anchorCopy(anchor, "2NW245573K1279237").corroborated, anchor).toBe(false);
      expect(anchorCopy(anchor, "2NW245573K1279237").text.toLowerCase(), anchor).not.toContain("corroborated by paypal");
    }
  });

  it("says the check is against our own record when that is all we have", () => {
    expect(anchorCopy("recorded_only", "2NW245573K1279237").text).toMatch(/against our own record of it, not against PayPal's copy/);
  });

  it("says nothing at PayPal holds it when nothing does, and still says the chain is intact", () => {
    const copy = anchorCopy("not_anchored", null);
    expect(copy.text).toMatch(/No PayPal order holds this hash/);
    expect(copy.text).toMatch(/an edit would break the chain/);
  });

  it("names the order when there is one, and does not invent one when there is not", () => {
    expect(anchorCopy("recorded_only", "2NW245573K1279237").text).toContain("order 2NW245573K1279237");
    expect(anchorCopy("recorded_only", null).text).toContain("the PayPal order");
  });

  it("writes no em dashes", () => {
    for (const anchor of [undefined, "corroborated", "recorded_only", "not_anchored"] as const) {
      expect(anchorCopy(anchor, "X").text).not.toContain("—");
    }
  });
});
