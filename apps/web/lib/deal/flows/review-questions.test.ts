/**
 * A re-review that keeps an open question must not post it to the deal chat
 * a second time. Driven through runReview on the in-memory store, with the
 * Buyer Pal's questions set by the test.
 */
import type { PalResult, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createServices } from "../../services";
import { runReview, unaskedQuestions } from "./review";
import { startDemoDeal } from "./start";

const quiet = () => {};

async function dealAsking(questions: () => string[]) {
  const services = createServices({}, quiet);
  await services.ready;
  const dealId = (await startDemoDeal(services, "clean-ps5")).id;
  const real = services.buyerPal.review.bind(services.buyerPal);
  services.buyerPal.review = (async (card, chat, context, options) => {
    const result = (await real(card, chat, context, options)) as PalResult<Verdict>;
    return { ...result, data: { ...result.data, questionsForSeller: questions() } };
  }) as typeof services.buyerPal.review;
  return { services, dealId };
}

async function buyerPalDealLines(services: Awaited<ReturnType<typeof dealAsking>>["services"], dealId: string) {
  const chat = await services.store.listMessages(dealId, "deal");
  return chat.filter((m) => m.author === "buyer_pal").map((m) => m.text);
}

describe("unaskedQuestions", () => {
  const said = (text: string) => ({ id: "m", dealId: "d", channel: "deal" as const, author: "buyer_pal" as const, text, photos: [], at: "2026-10-12T12:00:00.000Z" });

  it("matches on normalized text, so case and punctuation do not make a question new", () => {
    expect(unaskedQuestions(["Is the box sealed?"], [said("is the box sealed")])).toEqual([]);
  });

  it("finds a question inside an earlier merged message", () => {
    const merged = said("What is the serial number? Is the box sealed?");
    expect(unaskedQuestions(["Is the box sealed?", "Does it include a controller?"], [merged])).toEqual(["Does it include a controller?"]);
  });

  it("ignores what the seller or the other channels said", () => {
    const sellerLine = { ...said("Is the box sealed?"), author: "seller" as const };
    expect(unaskedQuestions(["Is the box sealed?"], [sellerLine])).toEqual(["Is the box sealed?"]);
  });
});

describe("runReview and repeat questions", () => {
  it("posts a question once, and posts only the new one on a re-review", async () => {
    let asking = ["Is the box sealed?"];
    const { services, dealId } = await dealAsking(() => asking);
    await runReview(services, dealId);
    const before = await buyerPalDealLines(services, dealId);
    expect(before.filter((t) => t.includes("Is the box sealed?"))).toHaveLength(1);

    await services.store.transition(dealId, "LISTED", "system", "Card changed.");
    asking = ["Is the box sealed?"];
    await runReview(services, dealId);
    const same = await buyerPalDealLines(services, dealId);
    expect(same.filter((t) => t.includes("Is the box sealed?"))).toHaveLength(1);

    await services.store.transition(dealId, "LISTED", "system", "Card changed.");
    asking = ["Is the box sealed?", "Does it include a controller?"];
    await runReview(services, dealId);
    const more = await buyerPalDealLines(services, dealId);
    expect(more.filter((t) => t.includes("Is the box sealed?"))).toHaveLength(1);
    expect(more.filter((t) => t.includes("Does it include a controller?"))).toHaveLength(1);
    expect(more.some((t) => t.startsWith("Buyer Pal to seller"))).toBe(false);
  });
});
