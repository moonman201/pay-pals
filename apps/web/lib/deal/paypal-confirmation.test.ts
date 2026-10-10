import { cleanPs5 } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { CONFIRMED_HEADING, describeRead, isMadeUpOrderId, planOrderRead, readOrderFields } from "./paypal-confirmation";

const payment = cleanPs5.payment!;
const real = { ...payment, paypalOrderId: "2NW245573K1279237" };

describe("planOrderRead", () => {
  it("reads a real order id back from the sandbox gateway", () => {
    expect(planOrderRead(real, "sandbox")).toEqual({ kind: "read", orderId: "2NW245573K1279237" });
  });

  it("never reads a fixture or mock order id back", () => {
    expect(planOrderRead({ ...payment, paypalOrderId: "DEMO-1A2B3C4D" }, "mock")).toEqual({ kind: "skip", result: { kind: "mock" } });
    expect(planOrderRead(real, "mock")).toEqual({ kind: "skip", result: { kind: "mock" } });
  });

  it("calls a seeded scenario's placeholder id an example deal whichever gateway is running", () => {
    expect(planOrderRead(payment, "sandbox")).toEqual({ kind: "skip", result: { kind: "example" } });
    expect(planOrderRead(payment, "mock")).toEqual({ kind: "skip", result: { kind: "example" } });
  });

  it("has nothing to read without a payment", () => {
    expect(planOrderRead(null, "sandbox")).toEqual({ kind: "skip", result: { kind: "none" } });
  });
});

describe("isMadeUpOrderId", () => {
  it("knows the two prefixes Pay Pals invents", () => {
    expect(isMadeUpOrderId("FIXTURE-ORDER-CLEAN")).toBe(true);
    expect(isMadeUpOrderId("DEMO-1A2B3C4D")).toBe(true);
    expect(isMadeUpOrderId("2NW245573K1279237")).toBe(false);
  });
});

describe("readOrderFields", () => {
  const order = {
    id: "2NW245573K1279237",
    status: "COMPLETED",
    create_time: "2026-10-09T10:00:00Z",
    update_time: "2026-10-09T10:05:00Z",
    purchase_units: [
      {
        custom_id: "deal-1#" + "a".repeat(64),
        payee: { email_address: "seller@example.com" },
        amount: { currency_code: "USD", value: "420.00" },
        items: [{ name: "PlayStation 5 CFI-1015A", description: "Serial AJ164952580, good condition" }],
        payments: { captures: [{ id: "9PC825472S929124S", status: "COMPLETED", amount: { currency_code: "USD", value: "420.00" } }] },
      },
    ],
  };

  it("takes every field from PayPal's own response", () => {
    expect(readOrderFields(order)).toEqual({
      orderId: "2NW245573K1279237",
      status: "COMPLETED",
      captureId: "9PC825472S929124S",
      captureStatus: "COMPLETED",
      amount: "420.00",
      currency: "USD",
      payeeEmail: "seller@example.com",
      createTime: "2026-10-09T10:00:00Z",
      updateTime: "2026-10-09T10:05:00Z",
      customId: "deal-1#" + "a".repeat(64),
      itemName: "PlayStation 5 CFI-1015A",
      itemDescription: "Serial AJ164952580, good condition",
    });
  });

  it("invents nothing when PayPal leaves a field out", () => {
    const fields = readOrderFields({ id: "X", status: "CREATED", purchase_units: [{ amount: { currency_code: "USD", value: "10.00" } }] });
    expect(fields.captureId).toBeNull();
    expect(fields.payeeEmail).toBeNull();
    expect(fields.customId).toBeNull();
    expect(fields.itemName).toBeNull();
    expect(fields.amount).toBe("10.00");
  });

  it("survives a response with no purchase units at all", () => {
    const fields = readOrderFields({});
    expect(fields.orderId).toBe("");
    expect(fields.amount).toBeNull();
  });

  it("prefers the capture amount over the order amount, which is what was actually taken", () => {
    const fields = readOrderFields({
      id: "X",
      status: "COMPLETED",
      purchase_units: [{ amount: { currency_code: "USD", value: "420.00" }, payments: { captures: [{ id: "C", status: "COMPLETED", amount: { currency_code: "USD", value: "419.00" } }] } }],
    });
    expect(fields.amount).toBe("419.00");
  });
});

describe("describeRead", () => {
  it("says Confirmed by PayPal only for a live read", () => {
    expect(describeRead({ kind: "confirmed", order: readOrderFields({ id: "X", status: "COMPLETED" }) }).heading).toBe(CONFIRMED_HEADING);
    for (const result of [{ kind: "example" }, { kind: "mock" }, { kind: "failed" }, { kind: "none" }] as const) {
      const described = describeRead(result);
      expect(described.confirmed).toBe(false);
      expect(described.heading).not.toContain(CONFIRMED_HEADING);
      expect(described.note.length).toBeGreaterThan(20);
    }
  });

  it("names what we do have instead, in the spirit of the example-deal label", () => {
    expect(describeRead({ kind: "example" }).note).toMatch(/seeded from a scenario/);
    expect(describeRead({ kind: "mock" }).note).toMatch(/made the order and capture ids up/);
    expect(describeRead({ kind: "failed" }).note).toMatch(/could not read this order back/);
    expect(describeRead({ kind: "none" }).note).toMatch(/No PayPal order has been created/);
  });

  it("writes no em dashes, Matt's rule", () => {
    for (const result of [{ kind: "confirmed", order: readOrderFields({}) }, { kind: "example" }, { kind: "mock" }, { kind: "failed" }, { kind: "none" }] as const) {
      const described = describeRead(result);
      expect(described.heading).not.toContain("—");
      expect(described.note).not.toContain("—");
    }
  });
});
