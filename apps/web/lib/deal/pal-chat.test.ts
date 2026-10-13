import type { Message, Verdict } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { collapseReviewMessages, reviewDoneLine, stripPalPrefix } from "./pal-chat";

function message(text: string, id = "m1"): Message {
  return { id, dealId: "d1", channel: "buyer_pal", author: "buyer_pal", text, photos: [], at: "2026-10-11T00:00:00.000Z" } as Message;
}

function verdict(palMessage: string, overall: Verdict["overall"] = "stop"): Verdict {
  return { dealId: "d1", cardVersion: 1, overall, flags: [], priceCheck: null, questionsForSeller: [], palMessage, createdAt: "2026-10-11T00:00:00.000Z" };
}

describe("reviewDoneLine", () => {
  it("is one line, naming the verdict and where the rest is", () => {
    expect(reviewDoneLine(verdict("...", "stop"))).toBe("Review done: Stop. Details above.");
    expect(reviewDoneLine(verdict("...", "go"))).toBe("Review done: Looks good. Details above.");
  });

  it("counts the open questions on a go", () => {
    const one = { ...verdict("...", "go"), questionsForSeller: ["Can you send a close-up?"] };
    expect(reviewDoneLine(one)).toBe("Review done: Looks good, 1 open question. Details above.");
    expect(reviewDoneLine({ ...one, questionsForSeller: ["a", "b"] })).toBe("Review done: Looks good, 2 open questions. Details above.");
  });
});

describe("collapseReviewMessages", () => {
  const long = "I looked at the card photo. The seller wants Friends and Family, and the photo is one already on file, and there is a deadline.";

  it("replaces the pal's copy of the review with one line", () => {
    const [only] = collapseReviewMessages([message(long)], [verdict(long)]);
    expect(only!.text).toBe("Review done: Stop. Details above.");
  });

  it("leaves every other message of the pal's alone", () => {
    const chat = [message("Ask me to review when you are ready.", "m1"), message(long, "m2")];
    const out = collapseReviewMessages(chat, [verdict(long)]);
    expect(out[0]!.text).toBe("Ask me to review when you are ready.");
    expect(out[1]!.text).toBe("Review done: Stop. Details above.");
  });

  it("collapses the pal's copy of the arrival check the same way, because the arrival panel prints it", () => {
    const arrival = "The serial on the console matches the card, and the box is intact.";
    const out = collapseReviewMessages([message("Ask me anything.", "m1"), message(arrival, "m2")], [], { palMessage: arrival });
    expect(out.map((m) => m.text)).toEqual(["Ask me anything.", "Arrival check done. Details above."]);
  });

  it("collapses both copies on a deal reviewed twice, each to its own verdict", () => {
    const second = "A different review, after the new photo arrived.";
    const out = collapseReviewMessages([message(long, "m1"), message(second, "m2")], [verdict(long, "stop"), verdict(second, "go")]);
    expect(out.map((m) => m.text)).toEqual(["Review done: Stop. Details above.", "Review done: Looks good. Details above."]);
  });

  it("matches past a difference in spacing, which storage and display can both introduce", () => {
    const [only] = collapseReviewMessages([message(`  ${long.replace(" ", "  ")}  `)], [verdict(long)]);
    expect(only!.text).toBe("Review done: Stop. Details above.");
  });

  it("changes nothing when no review has run", () => {
    const chat = [message("Ask me to review when you are ready.")];
    expect(collapseReviewMessages(chat, [])).toEqual(chat);
  });

  it("keeps the photos and the timestamp on a message it rewrites", () => {
    const original = message(long);
    const [only] = collapseReviewMessages([original], [verdict(long)]);
    expect(only!.at).toBe(original.at);
    expect(only!.id).toBe(original.id);
    expect(only!.photos).toEqual(original.photos);
  });
});

describe("stripPalPrefix", () => {
  it("takes the pal's own name off the front of its message", () => {
    expect(stripPalPrefix([message("Buyer Pal to seller: Can you send a close-up?")])[0]!.text).toBe("Can you send a close-up?");
    expect(stripPalPrefix([message("Seller Pal to buyer: Here it is.")])[0]!.text).toBe("Here it is.");
  });

  it("is not fooled by case or spacing, because stored messages vary", () => {
    expect(stripPalPrefix([message("buyer pal to seller:  Two spaces.")])[0]!.text).toBe("Two spaces.");
  });

  it("leaves a message that only mentions a pal in passing", () => {
    const text = "The Buyer Pal asked for a photo and the seller said no.";
    expect(stripPalPrefix([message(text)])[0]!.text).toBe(text);
  });
});
