/**
 * The transport, proved without a server: a finding reaches the client the
 * moment it lands rather than at the end, which is the whole of Decision 19,
 * and a client hanging up stops the talking and nothing else.
 *
 * Driven against the real registry with a review the test controls, so this
 * holds whether or not the Buyer Pal is emitting progress yet.
 */
import { cleanPs5, type ReviewProgress, type Verdict } from "@pay-pals/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { FlowError } from "./errors";
import { resetReviewRegistry, startOrJoinReview, type ProgressListener } from "./review-registry";
import { reviewStreamResponse } from "./review-stream-response";
import { createFrameParser, type ReviewStreamEvent } from "./review-stream";

afterEach(() => resetReviewRegistry());

const verdict: Verdict = {
  dealId: "d1",
  cardVersion: 1,
  overall: "stop",
  flags: [],
  priceCheck: cleanPs5.marketPrice,
  questionsForSeller: [],
  palMessage: "Stop.",
  createdAt: "2026-10-10T00:00:00.000Z",
};

/** A review the test drives: emit what you like, finish when you say so. */
function controllable(dealId: string) {
  let emit!: ProgressListener;
  let finish!: (v: Verdict) => void;
  let fail!: (e: unknown) => void;
  const review = startOrJoinReview(dealId, (onProgress) => {
    emit = onProgress;
    return new Promise<Verdict>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  });
  return { review, emit, finish, fail };
}

/** Reads whole events off the body as they are flushed, without waiting for the end. */
function readerFor(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const parse = createFrameParser();
  return async function next(): Promise<ReviewStreamEvent[]> {
    const { done, value } = await reader.read();
    return done ? [] : parse(decoder.decode(value, { stream: true }));
  };
}

async function drain(response: Response): Promise<ReviewStreamEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const parse = createFrameParser();
  const out: ReviewStreamEvent[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(...parse(decoder.decode(value, { stream: true })));
  }
  return out;
}

describe("a finding reaches the client the moment it lands", () => {
  it("flushes progress before the review is finished, not at the end", async () => {
    const { review, emit, finish } = controllable("d1");
    const next = readerFor(reviewStreamResponse(review));

    const flag: ReviewProgress = { kind: "flag", flag: { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "stop", evidence: "F&F only", explanation: "Asked for Friends and Family.", raisedByRule: true } };
    emit(flag);
    // This resolves while the review is still unfinished. If the body were buffered it would hang.
    expect(await next()).toEqual([{ kind: "progress", progress: flag }]);

    emit({ kind: "stage", stage: "checking the price" });
    expect(await next()).toEqual([{ kind: "progress", progress: { kind: "stage", stage: "checking the price" } }]);

    finish(verdict);
    expect(await next()).toEqual([{ kind: "done", verdict }]);
  });

  it("sets the headers a proxy needs so it does not hold the findings back", () => {
    const { review, finish } = controllable("d1");
    const response = reviewStreamResponse(review);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    finish(verdict);
  });

  it("ends with the verdict the server saved", async () => {
    const { review, emit, finish } = controllable("d1");
    const response = reviewStreamResponse(review);
    emit({ kind: "priceCheck", priceCheck: cleanPs5.marketPrice });
    finish(verdict);
    const events = await drain(response);
    expect(events.at(-1)).toEqual({ kind: "done", verdict });
    expect(events.filter((e) => e.kind === "done")).toHaveLength(1);
  });

  it("replays what landed before the client connected", async () => {
    const { review, emit, finish } = controllable("d1");
    emit({ kind: "stage", stage: "reading the chat" });
    emit({ kind: "photoRead", url: "https://example.test/a.jpg", readable: true });
    // Only now does anyone start listening, as a reconnecting browser does.
    const response = reviewStreamResponse(review);
    finish(verdict);
    const events = await drain(response);
    expect(events.map((e) => e.kind)).toEqual(["progress", "progress", "done"]);
  });

  it("reports a failure as an error frame rather than an empty result", async () => {
    const { review, fail } = controllable("d1");
    const response = reviewStreamResponse(review);
    fail(new FlowError("There is nothing to review yet.", 409));
    expect(await drain(response)).toEqual([{ kind: "error", error: "There is nothing to review yet." }]);
  });

  it("says something plain when the failure carries no message", async () => {
    const { review, fail } = controllable("d1");
    const response = reviewStreamResponse(review);
    fail({});
    expect(await drain(response)).toEqual([{ kind: "error", error: "The review did not finish." }]);
  });
});

describe("a client hanging up stops the talking and nothing else", () => {
  it("leaves the review running, and it still resolves with its verdict", async () => {
    const { review, emit, finish } = controllable("d1");
    const response = reviewStreamResponse(review);
    const reader = response.body!.getReader();
    emit({ kind: "stage", stage: "reading the chat" });
    await reader.read();

    await reader.cancel();
    expect(review.listeners.size).toBe(0);

    // The run is untouched: it finishes and its verdict is the one the server saves.
    emit({ kind: "stage", stage: "writing the verdict" });
    finish(verdict);
    await expect(review.done).resolves.toEqual(verdict);
  });

  it("does not throw when a finding lands after the client has gone", async () => {
    const { review, emit, finish } = controllable("d1");
    const response = reviewStreamResponse(review);
    await response.body!.cancel();
    expect(() => emit({ kind: "stage", stage: "still going" })).not.toThrow();
    finish(verdict);
    await expect(review.done).resolves.toEqual(verdict);
  });
});
