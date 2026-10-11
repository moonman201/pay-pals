/**
 * Matt's test, Decision 19: try to agree mid-review and fail, then agree once
 * the review lands and succeed.
 *
 * Driven through the real flows on the in-memory store with no keys, and
 * through the registry the route uses, so this is the same lock the server
 * applies and not a stand-in for it. The Buyer Pal is held open with a
 * promise the test resolves, which is what "mid-review" means here: no
 * sleeping, no racing.
 */
import type { PalResult, ReviewOptions, Verdict } from "@pay-pals/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServices } from "../../services";
import { FlowError } from "../errors";
import { AGREE_WHILE_REVIEWING, isReviewing, resetReviewRegistry, startOrJoinReview, watchReview } from "../review-registry";
import { agree } from "./agree";
import { runReview } from "./review";
import { startDemoDeal } from "./start";

const quiet = () => {};
type Services = ReturnType<typeof createServices>;

afterEach(() => resetReviewRegistry());

/**
 * Services whose Buyer Pal waits for the test before answering, plus a deal
 * in LISTED to review. Progress still flows while it waits, which is the
 * state the lock exists for.
 *
 * The pal is patched only after seeding has finished: the in-memory store
 * seeds the three demo deals by replaying their fixtures, and that calls the
 * Buyer Pal too. Holding those open would deadlock before the test began.
 */
async function heldReview(): Promise<{ services: Services; dealId: string; release: () => void; held: Promise<void>; emit: (options?: ReviewOptions) => void }> {
  const services = createServices({}, quiet);
  await services.ready;
  const dealId = (await startDemoDeal(services, "clean-ps5")).id;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const held = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let seenOptions: ReviewOptions | undefined;
  const real = services.buyerPal.review.bind(services.buyerPal);
  services.buyerPal.review = (async (card, chat, context, options) => {
    seenOptions = options;
    reached();
    await gate;
    return real(card, chat, context, options) as Promise<PalResult<Verdict>>;
  }) as typeof services.buyerPal.review;
  return { services, dealId, release, held, emit: (options) => (options ?? seenOptions)?.onProgress?.({ kind: "stage", stage: "checking the price" }) };
}

describe("agree is locked while a review is running", () => {
  it("refuses mid-review and succeeds once the review lands", async () => {
    const { services, dealId, release, held } = await heldReview();

    // Start the review the way the route does, so the registry holds it.
    const review = startOrJoinReview(dealId, (onProgress) => runReview(services, dealId, { onProgress }));
    await held;
    expect(isReviewing(dealId)).toBe(true);

    const refused = (await agree(services, dealId, "seller", false).catch((e: unknown) => e)) as FlowError;
    expect(refused).toBeInstanceOf(FlowError);
    expect(refused.message).toBe(AGREE_WHILE_REVIEWING);
    expect(refused.status).toBe(409);
    // Nothing was recorded by the refused attempt.
    expect((await services.store.getDeal(dealId))!.sellerAgreedAt).toBeNull();

    release();
    await review.done;
    expect(isReviewing(dealId)).toBe(false);

    const agreed = await agree(services, dealId, "seller", false);
    expect(agreed.sellerAgreedAt).not.toBeNull();
  });

  it("says the review is running rather than naming the state, which is about to change", async () => {
    const { services, dealId, release, held } = await heldReview();
    const review = startOrJoinReview(dealId, (onProgress) => runReview(services, dealId, { onProgress }));
    await held;
    // The deal is still LISTED here, so a state-only guard would have said that instead.
    expect((await services.store.getDeal(dealId))!.state).toBe("LISTED");
    const refused = (await agree(services, dealId, "buyer", true).catch((e: unknown) => e)) as FlowError;
    expect(refused.message).toMatch(/still reviewing/);
    expect(refused.message).not.toMatch(/LISTED/);
    release();
    await review.done;
  });

  it("locks the buyer as well as the seller, override or not", async () => {
    const { services, dealId, release, held } = await heldReview();
    const review = startOrJoinReview(dealId, (onProgress) => runReview(services, dealId, { onProgress }));
    await held;
    for (const override of [false, true]) {
      await expect(agree(services, dealId, "buyer", override)).rejects.toThrow(AGREE_WHILE_REVIEWING);
    }
    release();
    await review.done;
  });
});

describe("the review outlives the client that asked for it", () => {
  it("saves the verdict exactly once even when every watcher leaves mid-stream", async () => {
    const { services, dealId, release, held } = await heldReview();
    const review = startOrJoinReview(dealId, (onProgress) => runReview(services, dealId, { onProgress }));
    await held;

    // A stream attaches, takes a finding, then goes away, exactly as a closed tab does.
    const seen: string[] = [];
    const stop = watchReview(review, (event) => seen.push(event.kind));
    stop();

    release();
    const verdict = await review.done;
    expect(verdict.dealId).toBe(dealId);
    // The record is on the server, not in anything the client held.
    const saved = await services.store.listVerdicts(dealId);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.overall).toBe(verdict.overall);
    expect((await services.store.getDeal(dealId))!.state).toBe("REVIEWED");
  });

  it("joins the run already going rather than starting a second, so one ask saves one verdict", async () => {
    const { services, dealId, release, held } = await heldReview();
    const run = vi.fn((onProgress: (e: never) => void) => runReview(services, dealId, { onProgress: onProgress as never }));

    const first = startOrJoinReview(dealId, run);
    await held;
    const second = startOrJoinReview(dealId, run);
    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);

    release();
    await first.done;
    expect(await services.store.listVerdicts(dealId)).toHaveLength(1);
  });

  it("replays what already landed to a watcher that arrives late", async () => {
    const { services, dealId, release, held, emit } = await heldReview();
    const review = startOrJoinReview(dealId, (onProgress) => runReview(services, dealId, { onProgress }));
    await held;
    emit();
    expect(review.seen.length).toBeGreaterThan(0);

    const late: string[] = [];
    watchReview(review, (event) => late.push(event.kind));
    expect(late).toEqual(review.seen.map((e) => e.kind));

    release();
    await review.done;
  });

  it("clears the lock when the review fails, so the deal is not stuck", async () => {
    const services = createServices({}, quiet);
    await services.ready;
    const dealId = (await startDemoDeal(services, "clean-ps5")).id;
    services.buyerPal.review = (async () => {
      throw new Error("Claude did not answer.");
    }) as typeof services.buyerPal.review;

    const review = startOrJoinReview(dealId, (onProgress) => runReview(services, dealId, { onProgress }));
    await expect(review.done).rejects.toThrow("Claude did not answer.");
    expect(isReviewing(dealId)).toBe(false);
  });
});
