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
