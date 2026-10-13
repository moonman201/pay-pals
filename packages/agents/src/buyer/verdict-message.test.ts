import { describe, expect, it } from "vitest";
import { cleanPs5 } from "@pay-pals/contracts";
import { createFixturePriceLookup } from "../price/fixture-lookup";
import { fakeClaude } from "../testing/fake-claude";
import { createBuyerPal } from "./buyer-pal";
import { chatNote, goHeadline, verdictMessage } from "./verdict-message";

const base = { flags: [], askingPrice: null, priceCheck: null, serial: null, wouldChangeMyMind: [] } as const;

describe("goHeadline", () => {
  it("says Looks good with nothing open, and counts open questions in the right number", () => {
    expect(goHeadline()).toBe("Looks good.");
    expect(goHeadline(0)).toBe("Looks good.");
    expect(goHeadline(1)).toBe("Looks good, 1 open question.");
    expect(goHeadline(2)).toBe("Looks good, 2 open questions.");
    expect(goHeadline(3)).toBe("Looks good, 3 open questions.");
  });
});

describe("the go headline in the pal's own words", () => {
  it("leads the review and the chat note, and carries the open question count", () => {
    expect(verdictMessage({ ...base, overall: "go" }).split("\n")[0]).toBe("Looks good.");
    expect(verdictMessage({ ...base, overall: "go", openQuestions: 1 }).split("\n")[0]).toBe("Looks good, 1 open question.");
    expect(chatNote("go")).toBe("Review done: Looks good. Details above.");
    expect(chatNote("go", 2)).toBe("Review done: Looks good, 2 open questions. Details above.");
  });
  it("leaves stop and caution alone, whatever the question count", () => {
    expect(verdictMessage({ ...base, overall: "stop", openQuestions: 2 }).split("\n")[0]).toBe("Stop. Don't pay.");
    expect(verdictMessage({ ...base, overall: "caution", openQuestions: 2 }).split("\n")[0]).toBe("Careful.");
    expect(chatNote("stop", 2)).toBe("Review done: Stop. Details above.");
    expect(chatNote("caution", 2)).toBe("Review done: Careful. Details above.");
  });
  it("review passes the real question count through", async () => {
    const quiet = {
      additional_flags: [],
      severity_raises: [],
      explanations: [],
      questions_for_seller: ["Do you have the receipt from 2021?", "Can you send a photo of the console held in your hand?"],
      pal_message: "Price is fair.",
    };
    const model = fakeClaude(() => quiet);
    const pal = createBuyerPal({ anthropic: model, priceLookup: createFixturePriceLookup() });
    const { data, palMessage } = await pal.review(cleanPs5.cards[1]!, cleanPs5.chat);
    expect(data.overall).toBe("go");
    expect(data.questionsForSeller).toHaveLength(2);
    expect(data.palMessage.split("\n")[0]).toBe("Looks good, 2 open questions.");
    expect(palMessage).toBe("Review done: Looks good, 2 open questions. Details above.");
  });
});
