/**
 * Turning a running review into an HTTP response.
 *
 * Split out of the route so the transport can be tested without a server:
 * that a finding is flushed the moment it lands rather than held to the end,
 * that the `done` frame carries the saved verdict, that a failure arrives as
 * an `error` frame, and that a client hanging up stops the talking and
 * nothing else. The route keeps the parts that need a request: the services,
 * the origin and the up-front validation.
 */
import type { RunningReview } from "./review-registry";
import { watchReview } from "./review-registry";
import { encodeFrame, STREAM_HEADERS, type ReviewStreamEvent } from "./review-stream";
import { FlowError } from "./errors";

export function streamErrorMessage(error: unknown): string {
  if (error instanceof FlowError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "The review did not finish.";
}

/**
 * Server-sent events for one running review. The review is never cancelled
 * by anything here: if the client goes away this stops writing to it and the
 * run carries on to its save.
 */
export function reviewStreamResponse(review: RunningReview): Response {
  const encoder = new TextEncoder();
  let stopWatching: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ReviewStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeFrame(event)));
        } catch {
          // The client has gone. The review carries on; there is just nobody to tell.
        }
      };
      // Replays whatever already landed, so a client that reconnects sees the whole review.
      stopWatching = watchReview(review, (progress) => send({ kind: "progress", progress }));
      review.done
        .then(
          (verdict) => send({ kind: "done", verdict }),
          (error: unknown) => send({ kind: "error", error: streamErrorMessage(error) }),
        )
        .finally(() => {
          stopWatching?.();
          stopWatching = null;
          try {
            controller.close();
          } catch {
            /* already closed by the client leaving */
          }
        });
    },
    cancel() {
      // The browser went away. Stop talking to it and leave the review running.
      stopWatching?.();
      stopWatching = null;
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
