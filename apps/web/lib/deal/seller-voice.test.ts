import { describe, expect, it } from "vitest";
import { sellerStatusGroups, sellerVoice } from "./seller-voice";
import type { StatusGroup } from "./status-view";

describe("sellerVoice", () => {
  it("turns he and the verb after it into you and the plain verb", () => {
    expect(sellerVoice("he sends a close-up of the serial label on the console")).toBe("you send a close-up of the serial label on the console");
    expect(sellerVoice("he explains the price")).toBe("you explain the price");
  });

  it("keeps modals, past tense and negation, and fixes has and is", () => {
    expect(sellerVoice("He will not wait. He shipped it. He has the slab. He is ready.")).toBe("You will not wait. You shipped it. You have the slab. You are ready.");
  });

  it("turns his and him into your and you", () => {
    expect(sellerVoice("he sends the slab next to his name and today's date")).toBe("you send the slab next to your name and today's date");
    expect(sellerVoice("One of his photos. Ask him.")).toBe("One of your photos. Ask you.");
  });

  it("names the seller as you, and the seller's as your", () => {
    expect(sellerVoice("The seller refused Pay Pals protection.")).toBe("You refused Pay Pals protection.");
    expect(sellerVoice("The PayPal account is not in the seller's name.")).toBe("The PayPal account is not in your name.");
    expect(sellerVoice("That doesn't prove the seller has it.")).toBe("That doesn't prove you have it.");
  });

  it("leaves an appositive and a sentence with nobody to rename alone", () => {
    const apposite = "compared a@b.com with Sam Lee, the seller on this deal";
    expect(sellerVoice(apposite)).toBe(apposite);
    expect(sellerVoice("A receipt would change this.")).toBe("A receipt would change this.");
  });
});

describe("sellerVoice, safety", () => {
  it("leaves a quote verbatim, even when it holds he, his or the seller", () => {
    const text = 'The seller wrote: "he said his cousin will send it, the seller is fine with that". He pushed Friends and Family.';
    expect(sellerVoice(text)).toBe('You wrote: "he said his cousin will send it, the seller is fine with that". You pushed Friends and Family.');
    expect(sellerVoice("Evidence “he sends it Friday” from chat.")).toBe("Evidence “he sends it Friday” from chat.");
  });

  it("does not turn the buyer's he into you", () => {
    expect(sellerVoice("The buyer says he will pay today.")).toBe("The buyer says he will pay today.");
    expect(sellerVoice("The Buyer Pal checked his photos.")).toBe("The Buyer Pal checked your photos.");
  });

  it("keeps a named person a named person", () => {
    expect(sellerVoice("Sam Lee, the seller on this deal, sent it.")).toBe("Sam Lee, the seller on this deal, sent it.");
  });

  it("capitalises at a sentence start and not in the middle", () => {
    expect(sellerVoice("He sent it. Then he waited. The seller agreed, and the seller's photo is old.")).toBe("You sent it. Then you waited. You agreed, and your photo is old.");
  });
});

describe("sellerStatusGroups", () => {
  it("speaks to the seller in every row and leaves the structure alone", () => {
    const groups: StatusGroup[] = [
      { id: "shipping", title: "Shipping", items: [{ id: "packing", label: "Packing photos", status: "missing", detail: "None. The seller shipped without photographing the packing." }] },
    ];
    const out = sellerStatusGroups(groups);
    expect(out[0]!.items[0]!.detail).toBe("None. You shipped without photographing the packing.");
    expect(out[0]!.items[0]!.status).toBe("missing");
    expect(groups[0]!.items[0]!.detail).toMatch(/The seller shipped/);
  });
});
