import { cleanPs5, type Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createFrameParser, encodeFrame, wantsStream, type ReviewStreamEvent } from "./review-stream";

const verdict: Verdict = {
  dealId: "d",
  cardVersion: 1,
  overall: "go",
  flags: [],
  priceCheck: cleanPs5.marketPrice,
  questionsForSeller: [],
  palMessage: "Looks fine.",
  createdAt: "2026-10-10T00:00:00.000Z",
};

const events: ReviewStreamEvent[] = [
  { kind: "progress", progress: { kind: "stage", stage: "checking the price" } },
  { kind: "progress", progress: { kind: "flag", flag: { code: "URGENCY_PRESSURE", severity: "caution", evidence: "pay today", explanation: "Pushing for a fast payment.", raisedByRule: true } } },
  { kind: "done", verdict },
];

describe("wantsStream", () => {
  it("is the client asking for findings as they land", () => {
    expect(wantsStream("text/event-stream")).toBe(true);
    expect(wantsStream("text/event-stream, */*")).toBe(true);
    expect(wantsStream("application/json")).toBe(false);
    expect(wantsStream(null)).toBe(false);
  });
});

describe("the wire format", () => {
  it("round-trips every event", () => {
    const parse = createFrameParser();
    const out = parse(events.map(encodeFrame).join(""));
    expect(out).toEqual(events);
  });

  it("reads a frame split across network chunks", () => {
    const whole = encodeFrame(events[0]!);
    const parse = createFrameParser();
    // Split at every position: a stream can break anywhere, including inside the JSON.
    for (let cut = 1; cut < whole.length; cut++) {
      const p = createFrameParser();
      const first = p(whole.slice(0, cut));
      const second = p(whole.slice(cut));
      expect([...first, ...second], `cut at ${cut}`).toEqual([events[0]]);
    }
    expect(parse(whole)).toEqual([events[0]]);
  });

  it("reads several frames arriving in one chunk", () => {
    expect(createFrameParser()(events.map(encodeFrame).join(""))).toHaveLength(3);
  });

  it("holds a partial frame until the rest arrives, rather than guessing", () => {
    const parse = createFrameParser();
    expect(parse(`event: done\ndata: {"kind":"done"`)).toEqual([]);
    expect(parse(`,"verdict":${JSON.stringify(verdict)}}\n\n`)).toEqual([{ kind: "done", verdict }]);
  });

  it("drops a frame it cannot read rather than failing the review", () => {
    const parse = createFrameParser();
    expect(parse("event: progress\ndata: {not json\n\n")).toEqual([]);
    expect(parse(encodeFrame(events[2]!))).toEqual([events[2]]);
  });

  it("ends every frame with the blank line, without which nothing is delivered", () => {
    for (const event of events) expect(encodeFrame(event).endsWith("\n\n")).toBe(true);
  });

  it("never puts a newline inside a data line, which would split the frame", () => {
    const awkward: ReviewStreamEvent = { kind: "error", error: "line one\nline two" };
    const frame = encodeFrame(awkward);
    expect(frame.split("\n").filter((l) => l.startsWith("data:"))).toHaveLength(1);
    expect(createFrameParser()(frame)).toEqual([awkward]);
  });
});
