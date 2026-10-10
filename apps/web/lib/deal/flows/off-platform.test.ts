/**
 * The off-platform path, driven through the real flows on the in-memory
 * store with no keys, the same way the deal room drives them.
 */
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { FlowError } from "../errors";
import { hasChosenOffPlatform, OFF_PLATFORM_ORDER_REFUSED, OFF_PLATFORM_SUMMARY, ON_YOUR_OWN } from "../off-platform";
import { agree } from "./agree";
import { chooseOffPlatform } from "./off-platform";
import { createOrder } from "./pay";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

const quiet = () => {};
const noKeys = () => createServices({}, quiet);
type Services = ReturnType<typeof createServices>;

/** The clean deal, reviewed and locked by both sides, which is a deal at the payment step. */
async function atPaymentStep(services: Services): Promise<string> {
  const deal = await startDemoDeal(services, "clean-ps5");
  await runReview(services, deal.id);
  await agree(services, deal.id, "seller", false);
  await agree(services, deal.id, "buyer", false);
  return deal.id;
}

/** The slab, which the Buyer Pal blocks on a payment-method flag. */
async function blocked(services: Services): Promise<string> {
  const deal = await startDemoDeal(services, "fake-slab");
  await runReview(services, deal.id);
  return deal.id;
}

describe("chooseOffPlatform on a deal at the payment step", () => {
  it("records the line and cancels, because Pay Pals has nothing left to do", async () => {
    const services = noKeys();
    const dealId = await atPaymentStep(services);
    expect((await services.store.getDeal(dealId))!.state).toBe("AGREED");

    const after = await chooseOffPlatform(services, dealId);
    expect(after.state).toBe("CANCELLED");

    const events = await services.store.listEvents(dealId);
    expect(hasChosenOffPlatform(events)).toBe(true);
    const written = events.find((e) => e.kind === "off_platform_chosen")!;
    expect(written.summary).toBe(OFF_PLATFORM_SUMMARY);
    expect(written.summary).toContain(ON_YOUR_OWN);
    expect(written.actor).toBe("buyer");
  });

  it("tells the buyer in their own pane, without scolding them", async () => {
    const services = noKeys();
    const dealId = await atPaymentStep(services);
    await chooseOffPlatform(services, dealId);
    const pal = (await services.store.listMessages(dealId, "buyer_pal")).at(-1)!;
    expect(pal.text).toContain("no PayPal protection and no dispute path");
    expect(pal.text).toMatch(/Everything I checked stays on this page/);
  });

  it("refuses to create an order afterwards, whatever asks it to", async () => {
    const services = noKeys();
    const dealId = await atPaymentStep(services);
    await chooseOffPlatform(services, dealId);
    await expect(createOrder(services, dealId, "paypal")).rejects.toThrow();
    expect(await services.store.getPayment(dealId)).toBeNull();
  });

  it("refuses the order even on a deal left in PAYMENT_PENDING", async () => {
    const services = noKeys();
    const dealId = await atPaymentStep(services);
    // An order exists and the deal is PAYMENT_PENDING; the buyer then decides to pay another way.
    await createOrder(services, dealId, "paypal");
    expect((await services.store.getDeal(dealId))!.state).toBe("PAYMENT_PENDING");
    await chooseOffPlatform(services, dealId);
    const error = await createOrder(services, dealId, "paypal").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FlowError);
    expect((error as FlowError).message).toBe(OFF_PLATFORM_ORDER_REFUSED);
  });
});

describe("chooseOffPlatform on a blocked deal", () => {
  it("records the line and leaves the deal blocked", async () => {
    const services = noKeys();
    const dealId = await blocked(services);
    expect((await services.store.getDeal(dealId))!.state).toBe("BLOCKED");

    const after = await chooseOffPlatform(services, dealId);
    expect(after.state).toBe("BLOCKED");
    expect(hasChosenOffPlatform(await services.store.listEvents(dealId))).toBe(true);
  });
});

describe("chooseOffPlatform guards", () => {
  it("is the same choice twice, not two events", async () => {
    const services = noKeys();
    const dealId = await blocked(services);
    await chooseOffPlatform(services, dealId);
    await chooseOffPlatform(services, dealId);
    const events = await services.store.listEvents(dealId);
    expect(events.filter((e) => e.kind === "off_platform_chosen")).toHaveLength(1);
  });

  it("is not available before the buyer's pal has reviewed anything", async () => {
    const services = noKeys();
    const deal = await startDemoDeal(services, "clean-ps5");
    await expect(chooseOffPlatform(services, deal.id)).rejects.toBeInstanceOf(FlowError);
    expect(hasChosenOffPlatform(await services.store.listEvents(deal.id))).toBe(false);
  });

  it("does not exist on a deal that has no deal", async () => {
    const services = noKeys();
    await expect(chooseOffPlatform(services, "no-such-deal")).rejects.toBeInstanceOf(FlowError);
  });
});
