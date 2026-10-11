/**
 * The wire format for a streaming review, written once so the route and the
 * browser cannot drift. Server-sent events: one frame per finding, a `done`
 * frame carrying the saved verdict, an `error` frame if the review failed.
 *
 * Pure. No fetch, no Response, nothing that only runs on one side.
 */
import type { ReviewProgress, Verdict } from "@pay-pals/contracts";

/** What the client asks for to get the streaming answer rather than the whole verdict at the end. */
export const STREAM_ACCEPT = "text/event-stream";

export const STREAM_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/event-stream; charset=utf-8",
  // A buffered proxy would hold every finding until the end, which is the whole feature.
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
  connection: "keep-alive",
};

export type ReviewStreamEvent =
  | { kind: "progress"; progress: ReviewProgress }
  | { kind: "done"; verdict: Verdict }
  | { kind: "error"; error: string };

export function wantsStream(accept: string | null): boolean {
  return (accept ?? "").includes(STREAM_ACCEPT);
}

/** One SSE frame. The blank line is what ends it; without it nothing is delivered. */
export function encodeFrame(event: ReviewStreamEvent): string {
  return `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Feed bytes in, get whole events out. SSE frames can be split across
 * network chunks and several can arrive in one, so the caller keeps one
 * parser for the life of the stream.
 */
export function createFrameParser(): (chunk: string) => ReviewStreamEvent[] {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const out: ReviewStreamEvent[] = [];
    let split = buffer.indexOf("\n\n");
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (line) {
        try {
          out.push(JSON.parse(line.slice(5).trim()) as ReviewStreamEvent);
        } catch {
          // A frame we cannot read is dropped rather than failing the review: the
          // verdict is saved server-side either way and the page refreshes at the end.
        }
      }
      split = buffer.indexOf("\n\n");
    }
    return out;
  };
}
