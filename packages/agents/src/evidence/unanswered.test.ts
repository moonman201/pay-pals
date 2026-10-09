import { describe, expect, it } from "vitest";
import type { EvidenceInput, Verdict } from "@pay-pals/contracts";
import { cleanPs5, emptyBox, fakeSlab } from "@pay-pals/contracts";
import { unansweredQuestions } from "./unanswered";

const input = (fixture: typeof emptyBox, verdicts: Verdict[] = []): EvidenceInput => ({
  deal: fixture.deal,
  lockedCard: fixture.cards.at(-1)!,
  verdicts,
  arrivalCheck: null,
  messages: fixture.chat,
  payment: fixture.payment,
  shipment: fixture.shipment,
  timeline: fixture.timeline,
  requestedBy: "buyer",
});

const verdictAsking = (fixture: typeof emptyBox, question: string, cardVersion: number, createdAt: string): Verdict => ({
  dealId: fixture.deal.id,
  cardVersion,
  overall: "go",
  flags: [],
  priceCheck: null,
  questionsForSeller: [question],
  palMessage: "Go.",
  createdAt,
});

describe("unansweredQuestions", () => {
  it("empty-box: the Buyer Pal's question on the deal channel was never answered before payment", () => {
    expect(unansweredQuestions(input(emptyBox))).toEqual(["Can you add a close-up of the serial label on the console itself?"]);
  });

  it("the dated-note ask for a graded item rides the same path when the seller says nothing", () => {
    const note = "Can you send one photo of the slab next to a handwritten note with your name and today's date on it?";
    const asked = verdictAsking(fakeSlab, note, 1, fakeSlab.chat.at(-1)!.at);
    const slab: EvidenceInput = { ...input(fakeSlab, [asked]), payment: null };
    expect(unansweredQuestions(slab)).toContain(note);
  });

  it("clean-ps5: the question was answered by a seller reply and a newer card version", () => {
    const asked = verdictAsking(cleanPs5, "Can you send a close-up of the serial label on the console itself?", 1, cleanPs5.timeline[4]!.at);
    expect(unansweredQuestions(input(cleanPs5, [asked]))).toEqual([]);
    expect(unansweredQuestions(input(cleanPs5))).toEqual([]);
  });

  it("counts a verdict question with no seller reply and no card change, dedupes, and ignores questions asked after payment", () => {
    const before = verdictAsking(emptyBox, "Do you have the receipt?", 1, emptyBox.chat[1]!.at);
    const duplicate = verdictAsking(emptyBox, "do you have the receipt?", 1, emptyBox.chat[1]!.at);
    const after = verdictAsking(emptyBox, "Late question?", 1, emptyBox.timeline.at(-1)!.at);
    expect(unansweredQuestions(input(emptyBox, [before, duplicate, after]))).toEqual([
      "Do you have the receipt?",
      "Can you add a close-up of the serial label on the console itself?",
    ]);
  });

  it("an agreement notice or a one-word acknowledgement is not an answer; substance or a photo is", () => {
    const question = "Can you add a close-up of the serial label on the console itself?";
    const askedAt = emptyBox.chat[2]!.at;
    const replyAt = emptyBox.chat[3]!.at;
    const sellerSays = (text: string, photos: EvidenceInput["messages"][number]["photos"] = []): EvidenceInput => ({
      ...input(emptyBox),
      messages: [...emptyBox.chat, { ...emptyBox.chat[1]!, id: "s1", author: "seller", text, photos, at: replyAt }],
    });
    expect(unansweredQuestions(sellerSays("I agree to card version 1 at $410."))).toEqual([question]);
    expect(unansweredQuestions(sellerSays("I agree to card version 1 at $410. I read my pal's warning and chose to continue."))).toEqual([question]);
    expect(unansweredQuestions(sellerSays("I read my pal's warning and chose to continue."))).toEqual([question]);
    expect(unansweredQuestions(sellerSays("ok"))).toEqual([question]);
    expect(unansweredQuestions(sellerSays("Sure!"))).toEqual([question]);
    expect(unansweredQuestions(sellerSays("The console is packed already, I cannot get to that screen."))).toEqual([]);
    expect(unansweredQuestions(sellerSays("Here you go.", [{ url: "/fixtures/empty-box/serial-close-up.jpg", whatItShows: "Close-up of the label on the back of the console.", addedBy: "seller" }]))).toEqual([]);
    expect(askedAt < replyAt).toBe(true);
  });

  it("treats a seller reply after the question as an answer, but not one before it", () => {
    const earlyReply = verdictAsking(emptyBox, "Any marks on the glass?", 1, emptyBox.chat[1]!.at);
    expect(unansweredQuestions(input(emptyBox, [earlyReply]))).toContain("Any marks on the glass?");
    const withReply: EvidenceInput = {
      ...input(emptyBox, [earlyReply]),
      messages: [...emptyBox.chat, { ...emptyBox.chat[1]!, id: "r1", author: "seller", text: "No marks.", at: emptyBox.chat[2]!.at }],
    };
    expect(unansweredQuestions(withReply)).not.toContain("Any marks on the glass?");
  });
});
