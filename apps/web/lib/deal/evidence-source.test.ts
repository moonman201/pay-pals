import type { Message } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { evidenceSourceId, messageAnchor } from "./evidence-source";

function message(id: string, text: string): Message {
  return { id, dealId: "d1", channel: "deal", author: "seller", text, photos: [], at: "2026-10-11T00:00:00.000Z" } as Message;
}

const chat = [
  message("m1", "Hi, is the slab still available?"),
  message("m2", "Need the $140 by Friends and Family or Zelle within the hour, I have two others waiting."),
  message("m3", "I am not sending a photo with my name on it, I am at work."),
];

describe("evidenceSourceId", () => {
  it("finds the message a quote was taken from", () => {
    expect(evidenceSourceId("Need the $140 by Friends and Family or Zelle within the hour", chat)).toBe("m2");
    expect(evidenceSourceId("I am not sending a photo with my name on it", chat)).toBe("m3");
  });

  it("matches past the quote marks and spacing a pal may add", () => {
    expect(evidenceSourceId("  I am NOT sending a photo with my name on it  ", chat)).toBe("m3");
    expect(evidenceSourceId("“I am not sending a photo with my name on it”".replace(/[“”]/g, ""), chat)).toBe("m3");
  });

  it("links nowhere when the quote is in two messages, because the wrong link is worse than none", () => {
    const twice = [...chat, message("m4", "Need the $140 by Friends and Family or Zelle within the hour, I have two others waiting.")];
    expect(evidenceSourceId("Need the $140 by Friends and Family or Zelle within the hour", twice)).toBeNull();
  });

  it("links nowhere for a fragment, which would match half the chat", () => {
    expect(evidenceSourceId("the", chat)).toBeNull();
    expect(evidenceSourceId("$140", chat)).toBeNull();
    expect(evidenceSourceId("", chat)).toBeNull();
    expect(evidenceSourceId(null, chat)).toBeNull();
  });

  it("links nowhere for evidence that is a rule reading rather than a quote", () => {
    expect(evidenceSourceId("Packing step not done: Photo of the console going into the box", chat)).toBeNull();
    expect(evidenceSourceId("Card serial AJ164952580 against box label ZZ000000000", chat)).toBeNull();
  });

  it("has nothing to find in an empty chat", () => {
    expect(evidenceSourceId("Need the $140 by Friends and Family", [])).toBeNull();
  });
});

describe("messageAnchor", () => {
  it("is read by both ends, so the link and the target cannot drift apart", () => {
    expect(messageAnchor("m2")).toBe("msg-m2");
  });
});
