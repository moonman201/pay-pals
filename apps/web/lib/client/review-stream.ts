/**
 * Asking for a review from the browser, and taking the findings as they land.
 *
 * Degrades rather than fails. If the server answered with JSON instead of a
 * stream, or this browser has no streaming body, the whole response is read
 * and treated as the finished verdict: no findings arrive early, the review
 * still completes, and the page still refreshes. The verdict is saved on the
 * server either way, so nothing here is load-bearing for the record.
 */
import type { ReviewProgress, Verdict } from "@pay-pals/contracts";
import { createFrameParser, STREAM_ACCEPT } from "@/lib/deal/review-stream";
import { dealApi } from "./api";

export interface ReviewStreamHandlers {
  onProgress?: (event: ReviewProgress) => void;
}

/**
 * Runs the review. Resolves with the saved verdict, or throws with the
 * server's own sentence. Progress is best effort; the resolve is not.
 */
export async function streamReview(dealId: string, handlers: ReviewStreamHandlers = {}): Promise<Verdict> {
  const res = await fetch(dealApi(dealId, "review"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: STREAM_ACCEPT },
    body: "{}",
  });

  const streaming = (res.headers.get("content-type") ?? "").includes("text/event-stream");
  if (!streaming || !res.body) {
    // The plain answer: either the server chose JSON, or this browser cannot read a body stream.
    const data = (await res.json().catch(() => ({}))) as Partial<Verdict> & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
    return data as Verdict;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parse = createFrameParser();
  let verdict: Verdict | null = null;
  let failure: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parse(decoder.decode(value, { stream: true }))) {
      if (event.kind === "progress") handlers.onProgress?.(event.progress);
      else if (event.kind === "done") verdict = event.verdict;
      else failure = event.error;
    }
  }

  if (failure) throw new Error(failure);
  if (!verdict) throw new Error("The review ended without a verdict. Reload the page to see where the deal stands.");
  return verdict;
}
