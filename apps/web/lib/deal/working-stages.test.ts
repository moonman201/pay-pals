import { describe, expect, it } from "vitest";
import { ARRIVAL_STAGES, reviewStages, stageAt, STAGE_MS } from "./working-stages";

describe("reviewStages", () => {
  it("names the cert stage only when the card has a cert number", () => {
    expect(reviewStages(true)).toEqual(["Reading the chat", "Checking the price", "Checking the cert", "Writing the verdict"]);
    expect(reviewStages(false)).toEqual(["Reading the chat", "Checking the price", "Writing the verdict"]);
  });
});

describe("stageAt", () => {
  it("moves on every step and then stays on the last stage", () => {
    const stages = reviewStages(true);
    expect(stageAt(stages, 0)).toBe("Reading the chat");
    expect(stageAt(stages, STAGE_MS - 1)).toBe("Reading the chat");
    expect(stageAt(stages, STAGE_MS)).toBe("Checking the price");
    expect(stageAt(stages, STAGE_MS * 2)).toBe("Checking the cert");
    expect(stageAt(stages, STAGE_MS * 3)).toBe("Writing the verdict");
    // A slow pal does not loop back to the beginning.
    expect(stageAt(stages, STAGE_MS * 40)).toBe("Writing the verdict");
  });

  it("is steady on odd input", () => {
    expect(stageAt(ARRIVAL_STAGES, -5)).toBe(ARRIVAL_STAGES[0]);
    expect(stageAt([], 1000)).toBe("");
  });
});
