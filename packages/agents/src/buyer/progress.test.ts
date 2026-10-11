/**
 * Streaming a review. The thing these tests are really protecting is one
 * invariant: nothing reported while the review runs may be absent from, or
 * contradicted by, the verdict it resolves to. A flag that appears and is
 * taken away teaches the buyer not to trust the panel.
 *
 * Order is deliberately not asserted anywhere. The lookups run concurrently,
 * so the order changes between runs, and an order-sensitive assertion on a
 * streaming interface is a flaky suite by construction (Decision 19).
 */
import { describe, expect, it } from "vitest";
import type { ReviewProgress } from "@pay-pals/contracts";
import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { createBuyerPal } from "./buyer-pal";
import { createFixtureCertLookup } from "../cert/fixture-lookup";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude } from "../testing/fake-claude";
import { asFetched, pictureA } from "../testing/images";

const priceLookup = createFixturePriceLookup();
const pal = () => createBuyerPal({ anthropic: null, priceLookup, certLookup: createFixtureCertLookup() });

/** Collects everything a review reports. */
function recorder() {
  const events: ReviewProgress[] = [];
  return { events, onProgress: (event: ReviewProgress) => void events.push(event) };
}

const kinds = (events: ReviewProgress[]) => new Set(events.map((e) => e.kind));
const flagCodes = (events: ReviewProgress[]) => events.flatMap((e) => (e.kind === "flag" ? [e.flag.code] : []));

describe("a review reports its findings as they land", () => {
  it.each([fakeSlab, cleanPs5, emptyBox].map((f) => [f.id, f] as const))("%s: every flag reported is in the final verdict", async (_id, fixture) => {
    const { events, onProgress } = recorder();
    const { data: verdict } = await pal().review(fixture.cards.at(-1)!, fixture.chat, { seller: fixture.seller }, { onProgress });

    const reported = flagCodes(events);
    const final = verdict.flags.map((f) => f.code);
    // The invariant. Nothing may be shown and then withdrawn.
    for (const code of reported) expect(final, `${code} was reported but is not in the verdict`).toContain(code);
    // And nothing in the verdict goes unreported, so the page never has to discover a flag late.
    for (const code of final) expect(reported, `${code} is in the verdict but was never reported`).toContain(code);
    expect(new Set(reported).size).toBe(reported.length);
  });

  it("reports a stop flag before the review resolves, not with it", async () => {
    const seen: string[] = [];
    let resolved = false;
    const { data: verdict } = await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, {
      onProgress: (event) => {
        if (event.kind === "flag" && event.flag.severity === "stop") seen.push(`${event.flag.code} while resolved=${resolved}`);
      },
    });
    resolved = true;
    expect(verdict.overall).toBe("stop");
    expect(seen.length).toBeGreaterThan(0);
    for (const line of seen) expect(line).toContain("resolved=false");
  });

  it("reports the stage, the price and the cert as well as the flags", async () => {
    const { events, onProgress } = recorder();
    await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, { onProgress });
    expect(kinds(events)).toContain("stage");
    expect(kinds(events)).toContain("priceCheck");
    expect(kinds(events)).toContain("certCheck");
    const stages = events.flatMap((e) => (e.kind === "stage" ? [e.stage] : []));
    expect(stages).toContain("checking the market price");
    expect(stages).toContain("looking up the grading cert");
    // Plain clauses for a status line, not sentences.
    for (const stage of stages) expect(stage).not.toMatch(/[.!]$/);
  });

  it("reports each photo as it is read, once per photo", async () => {
    const card = cleanPs5.cards[1]!;
    const client = fakeClaude((params) => (params.tools?.[0]?.name === "report_photo_reading" ? { brand: null, model: null, serial: null, serial_legibility: "none", uncertain_characters: [], unreadable_reason: null, serial_on: null, item_present: true } : null));
    const { events, onProgress } = recorder();
    await createBuyerPal({ anthropic: client, priceLookup, fetchImage: async () => asFetched(pictureA()), photoBaseUrl: "https://example.test" }).review(card, cleanPs5.chat, { seller: cleanPs5.seller }, { onProgress });
    const reads = events.flatMap((e) => (e.kind === "photoRead" ? [e.url] : []));
    expect(reads.sort()).toEqual(card.photos.map((p) => p.url).sort());
  });

  it("says nothing at all when the caller passes no handler", async () => {
    // The whole path has to work with onProgress absent, which is every existing caller.
    const { data: verdict } = await pal().review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller });
    expect(verdict.overall).toBe("go");
  });
});

describe("progress never puts the verdict at risk", () => {
  it("a handler that throws on every event does not fail the review", async () => {
    const { data: verdict, palMessage } = await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, {
      onProgress: () => {
        throw new Error("the page went away");
      },
    });
    expect(verdict.overall).toBe("stop");
    expect(verdict.flags.length).toBeGreaterThan(0);
    expect(palMessage.length).toBeGreaterThan(20);
  });

  it("a handler that throws only on the first event still sees the rest", async () => {
    let calls = 0;
    const seen: ReviewProgress["kind"][] = [];
    await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, {
      onProgress: (event) => {
        calls += 1;
        if (calls === 1) throw new Error("first one failed");
        seen.push(event.kind);
      },
    });
    expect(calls).toBeGreaterThan(1);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("is never called after the review resolves", async () => {
    let resolved = false;
    const after: string[] = [];
    await pal().review(cleanPs5.cards[1]!, cleanPs5.chat, { seller: cleanPs5.seller }, {
      onProgress: (event) => {
        if (resolved) after.push(event.kind);
      },
    });
    resolved = true;
    await new Promise((r) => setTimeout(r, 25));
    expect(after).toEqual([]);
  });

  it("reports the same verdict it would have reported with no handler at all", async () => {
    const quiet = await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller });
    const { onProgress } = recorder();
    const loud = await pal().review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, { onProgress });
    expect(loud.data.overall).toBe(quiet.data.overall);
    expect(loud.data.flags.map((f) => f.code).sort()).toEqual(quiet.data.flags.map((f) => f.code).sort());
    expect(loud.data.questionsForSeller).toEqual(quiet.data.questionsForSeller);
  });
});

describe("the model cannot withdraw a flag that was already reported", () => {
  /** A model that tries every way it has to drop or soften the rules' findings. */
  const hostile = () =>
    fakeClaude((params) =>
      params.tools?.[0]?.name === "submit_review"
        ? {
            additional_flags: [],
            // Severities below the rule's are ignored by the merge; this checks the reported flag survives it.
            severity_raises: [
              { code: "FRIENDS_AND_FAMILY_REQUEST", severity: "info" },
              { code: "URGENCY_PRESSURE", severity: "info" },
              { code: "PRICE_FAR_BELOW_MARKET", severity: "info" },
            ],
            explanations: [{ code: "FRIENDS_AND_FAMILY_REQUEST", explanation: "Nothing to worry about here." }],
            questions_for_seller: [],
            pal_message: "This all looks fine to me.",
            reasoning: { checked: [], found: [], could_not_verify: [], would_change_my_mind: [] },
          }
        : null,
    );

  it("keeps every reported flag in the verdict even when the model argues them all down", async () => {
    const { events, onProgress } = recorder();
    const buyerPal = createBuyerPal({ anthropic: hostile(), priceLookup, certLookup: createFixtureCertLookup() });
    const { data: verdict } = await buyerPal.review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, { onProgress });
    const reported = flagCodes(events);
    expect(reported.length).toBeGreaterThan(0);
    for (const code of reported) expect(verdict.flags.map((f) => f.code)).toContain(code);
    expect(verdict.overall).toBe("stop");
  });

  it("a reported severity is never lower in the verdict than it was when reported", async () => {
    const reportedAt = new Map<string, string>();
    const buyerPal = createBuyerPal({ anthropic: hostile(), priceLookup, certLookup: createFixtureCertLookup() });
    const { data: verdict } = await buyerPal.review(fakeSlab.cards.at(-1)!, fakeSlab.chat, { seller: fakeSlab.seller }, {
      onProgress: (event) => {
        if (event.kind === "flag") reportedAt.set(event.flag.code, event.flag.severity);
      },
    });
    const rank = { info: 0, caution: 1, stop: 2 } as const;
    for (const flag of verdict.flags) {
      const was = reportedAt.get(flag.code);
      if (was) expect(rank[flag.severity], `${flag.code} fell from ${was} to ${flag.severity}`).toBeGreaterThanOrEqual(rank[was as keyof typeof rank]);
    }
  });
});
