import type { PalReasoning } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { couldNotVerify, hasAnyReason, hasReasons, REASON_GROUP_IDS, reasonGroups } from "./pal-reasons";

const full: PalReasoning = {
  checked: ["The serial on the back of the console, against the box label."],
  found: ["Both read AJ164952580."],
  couldNotVerify: ["Whether the seller owns the console."],
  wouldChangeMyMind: ["A photo of the console powered on with the serial in frame."],
};

const nothingOpen: PalReasoning = { checked: ["The cert number."], found: ["It matches."], couldNotVerify: [], wouldChangeMyMind: [] };

describe("hasReasons", () => {
  it("is absent-tolerant, so a verdict stored before the field existed renders as it did", () => {
    expect(hasReasons(undefined)).toBe(false);
    expect(hasReasons(null)).toBe(false);
    expect(reasonGroups(undefined)).toEqual([]);
    expect(hasAnyReason(undefined)).toBe(false);
    expect(couldNotVerify(undefined)).toEqual([]);
  });
});

describe("reasonGroups", () => {
  it("gives the four groups in order, each with a title and a line saying what it is for", () => {
    const groups = reasonGroups(full);
    expect(groups.map((g) => g.id)).toEqual(REASON_GROUP_IDS);
    expect(groups.map((g) => g.title)).toEqual(["What I checked", "What I found", "What I could not check", "What would change my mind"]);
    for (const group of groups) {
      expect(group.intro.length).toBeGreaterThan(10);
      expect(group.intro).not.toContain("—");
    }
  });

  it("still prints what the pal could not check when the list is empty, which is the point of the field", () => {
    const groups = reasonGroups(nothingOpen);
    const open = groups.find((g) => g.id === "couldNotVerify")!;
    expect(open.items).toEqual([]);
    expect(open.emptyText).toBe("Nothing. Everything I set out to check, I could check.");
  });

  it("drops the other three groups when they are empty, rather than printing nothing under a title", () => {
    expect(reasonGroups(nothingOpen).map((g) => g.id)).toEqual(["checked", "found", "couldNotVerify"]);
    const blank: PalReasoning = { checked: [], found: [], couldNotVerify: [], wouldChangeMyMind: [] };
    expect(reasonGroups(blank).map((g) => g.id)).toEqual(["couldNotVerify"]);
  });

  it("renders only the groups a surface asks for, in that order", () => {
    expect(reasonGroups(full, ["wouldChangeMyMind"]).map((g) => g.id)).toEqual(["wouldChangeMyMind"]);
    expect(reasonGroups(full, ["found", "checked"]).map((g) => g.id)).toEqual(["found", "checked"]);
  });

  it("marks what the pal could not check as the group to notice, and the ask as an ask", () => {
    const byId = Object.fromEntries(reasonGroups(full).map((g) => [g.id, g]));
    expect(byId.couldNotVerify!.tone).toBe("caution");
    expect(byId.wouldChangeMyMind!.tone).toBe("ask");
    expect(byId.wouldChangeMyMind!.intro).toMatch(/Send any of these and I will look again/);
  });

  it("says the open questions are not findings against the seller", () => {
    expect(reasonGroups(full).find((g) => g.id === "couldNotVerify")!.intro).toMatch(/not findings against the seller/);
  });
});

describe("couldNotVerify", () => {
  it("hands back the sentences so the status view can list them one line each", () => {
    expect(couldNotVerify(full)).toEqual(["Whether the seller owns the console."]);
    expect(couldNotVerify(nothingOpen)).toEqual([]);
  });

  it("copies the list rather than handing out the pal's own array", () => {
    const out = couldNotVerify(full);
    out.push("something else");
    expect(full.couldNotVerify).toHaveLength(1);
  });
});
