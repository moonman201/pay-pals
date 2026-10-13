import { emptyBox, type DealEvent } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { issueOpened, issueChoicesFor, ISSUE_REASON_LABELS } from "./issue";

const OPENED = emptyBox.timeline.find((e) => e.kind === "state_changed" && e.toState === "ISSUE")!;
const withSummary = (summary: string): DealEvent[] => emptyBox.timeline.map((e) => (e.id === OPENED.id ? { ...e, summary } : e));

describe("issueOpened", () => {
  it("finds the reason a live deal recorded, with the buyer's own choice in it", () => {
    const said = "Issue opened: what arrived does not match the locked card. The box arrived empty.";
    const found = issueOpened(withSummary(said))!;
    expect(found.summary).toBe(said);
    expect(found.at).toBe(OPENED.at);
  });

  // 2026-10-12: this test used to assert the empty-box fixture's summary was
  // the bare "Issue opened." and that issueOpened returned null for it. Commit
  // 67b962d gave the fixture the buyer's own reason, so the expectation was
  // wrong, not the code (PLAN.md Decision 16). The rule is now tested on
  // constructed summaries, and the seeded deal is asserted to yield a reason.
  it("says nothing when the summary is only the lead-in, in any casing or punctuation", () => {
    for (const bare of ["Issue opened.", "issue opened", "Issue opened:", "  Issue opened. ", "ISSUE OPENED."]) {
      expect(issueOpened(withSummary(bare)), bare).toBeNull();
    }
  });

  it("gives the seeded empty-box deal's reason, because the fixture carries the buyer's own words", () => {
    const found = issueOpened(emptyBox.timeline)!;
    expect(found).not.toBeNull();
    expect(found.summary).toContain("The box arrived empty");
  });

  it("says nothing on a deal where nobody opened an issue", () => {
    expect(issueOpened(emptyBox.timeline.filter((e) => e.id !== OPENED.id))).toBeNull();
    expect(issueOpened([])).toBeNull();
  });

  it("takes the most recent one, for a deal that opened an issue twice", () => {
    const twice = [...withSummary("Issue opened: the item never arrived."), { ...OPENED, id: "later", summary: "Issue opened: what arrived does not match the locked card." }];
    expect(issueOpened(twice)!.summary).toContain("does not match");
  });
});

describe("the issue choices", () => {
  it("offers the empty box as its own choice after delivery, which is where the detail comes from", () => {
    const choices = issueChoicesFor("DELIVERED");
    const empty = choices.find((c) => c.id === "empty_box")!;
    expect(empty.label).toBe("The box arrived empty");
    expect(empty.reason).toBe("arrival_mismatch");
    // The label is the buyer's words; the enum is the API's. This is why the
    // label has to be carried separately: the enum alone cannot say it.
    expect(empty.details).toBe("The box arrived empty.");
    expect(ISSUE_REASON_LABELS[empty.reason]).not.toBe(empty.label);
  });
});
