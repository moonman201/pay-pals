import { cleanPs5 } from "@pay-pals/contracts";
import { describe, expect, it, vi } from "vitest";
import { readPayPalOrder } from "./paypal-read";

const payment = cleanPs5.payment!;
const real = { ...payment, paypalOrderId: "2NW245573K1279237" };

describe("readPayPalOrder", () => {
  it("confirms from PayPal's own response", async () => {
    const getOrder = vi.fn().mockResolvedValue({ id: "2NW245573K1279237", status: "COMPLETED" });
    const result = await readPayPalOrder({ getOrder }, real, "sandbox");
    expect(getOrder).toHaveBeenCalledWith("2NW245573K1279237");
    expect(result).toEqual({ kind: "confirmed", order: expect.objectContaining({ orderId: "2NW245573K1279237", status: "COMPLETED" }) });
  });

  it("reports a failed read instead of throwing into the page, and keeps the reason in the log", async () => {
    const getOrder = vi.fn().mockRejectedValue(new Error("PayPal returned 404"));
    const log = vi.fn();
    const result = await readPayPalOrder({ getOrder }, real, "sandbox", log);
    expect(result).toEqual({ kind: "failed" });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("PayPal returned 404"));
  });

  it("does not call PayPal for a fixture order id, the mock gateway or a deal with no payment", async () => {
    const getOrder = vi.fn();
    expect(await readPayPalOrder({ getOrder }, payment, "sandbox")).toEqual({ kind: "example" });
    expect(await readPayPalOrder({ getOrder }, real, "mock")).toEqual({ kind: "mock" });
    expect(await readPayPalOrder({ getOrder }, { ...payment, paypalOrderId: "DEMO-1A2B3C4D" }, "sandbox")).toEqual({ kind: "mock" });
    expect(await readPayPalOrder({ getOrder }, null, "sandbox")).toEqual({ kind: "none" });
    expect(getOrder).not.toHaveBeenCalled();
  });
});
