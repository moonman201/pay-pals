import { describe, expect, it } from "vitest";
import { alreadySaid, reasonsNotRepeated } from "./said-once";

describe("alreadySaid", () => {
  it("ignores case and punctuation", () => {
    expect(alreadySaid("Careful. - The serial is from the box label only.", "the serial is from the box label only")).toBe(true);
    expect(alreadySaid("Careful.", "")).toBe(false);
  });
});

describe("reasonsNotRepeated", () => {
  const reasoning = {
    checked: ["The chat."],
    found: ["The serial is from the box label only.", "The price sits inside the range."],
    couldNotVerify: ["The serial is from the box label only."],
    wouldChangeMyMind: ["he sends a close-up of the serial label on the console"],
  };

  it("drops found and ask lines the message already says, keeps the rest", () => {
    const out = reasonsNotRepeated(reasoning, "Careful. The serial is from the box label only. I'd look again if he sends a close-up of the serial label on the console.", [])!;
    expect(out.found).toEqual(["The price sits inside the range."]);
    expect(out.wouldChangeMyMind).toEqual([]);
  });

  it("drops a found line a flag card says word for word", () => {
    const out = reasonsNotRepeated(reasoning, "Careful.", ["The serial is from the box label only."])!;
    expect(out.found).toEqual(["The price sits inside the range."]);
  });

  it("never trims what the pal said it could not check", () => {
    const out = reasonsNotRepeated(reasoning, "The serial is from the box label only.", [])!;
    expect(out.couldNotVerify).toEqual(reasoning.couldNotVerify);
    expect(out.checked).toEqual(reasoning.checked);
  });
});
