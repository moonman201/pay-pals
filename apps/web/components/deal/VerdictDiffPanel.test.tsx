import { cleanPs5, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { diffVerdicts } from "@/lib/deal/verdict-diff";
import { VerdictDiffPanel } from "./VerdictDiffPanel";

function flag(code: RedFlag["code"], severity: RedFlag["severity"] = "caution"): RedFlag {
  return { code, severity, evidence: "the listing text", explanation: "One plain sentence.", raisedByRule: true };
}

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    dealId: "d",
    cardVersion: 1,
    overall: "caution",
    flags: [],
    priceCheck: cleanPs5.marketPrice,
    questionsForSeller: [],
    palMessage: "Have a look.",
    createdAt: "2026-10-09T10:00:00.000Z",
    ...overrides,
  };
}

const before = verdict({ cardVersion: 1, overall: "caution", flags: [flag("MISSING_SERIAL")], questionsForSeller: ["Can you send a close-up of the serial label on the console itself?"] });
const after = verdict({ cardVersion: 2, overall: "go", flags: [], createdAt: "2026-10-09T11:00:00.000Z" });

describe("VerdictDiffPanel", () => {
  it("puts the two verdicts side by side with their card versions", () => {
    render(<VerdictDiffPanel diff={diffVerdicts(before, after)} />);
    const sides = screen.getAllByTestId("verdict-diff-side");
    expect(sides).toHaveLength(2);
    expect(sides[0]).toHaveAttribute("data-overall", "caution");
    expect(sides[1]).toHaveAttribute("data-overall", "go");
    expect(sides[0]).toHaveTextContent("Card version 1");
    expect(sides[1]).toHaveTextContent("Card version 2");
  });

  it("marks the flag that cleared on the before side and says it in the change list", () => {
    render(<VerdictDiffPanel diff={diffVerdicts(before, after)} />);
    const sides = screen.getAllByTestId("verdict-diff-side");
    expect(sides[0]).toHaveTextContent("no serial number");
    expect(sides[0]).toHaveTextContent("cleared");
    expect(sides[1]).toHaveTextContent("No red flags.");
    expect(screen.getByTestId("verdict-diff-lines")).toHaveTextContent("The verdict went from Caution to Looks good.");
    expect(screen.getByTestId("verdict-diff-lines")).toHaveTextContent("Cleared: no serial number.");
  });

  it("marks a flag that appeared on the after side", () => {
    const worse = verdict({ cardVersion: 2, overall: "stop", flags: [flag("STOCK_OR_REUSED_PHOTO", "stop")] });
    render(<VerdictDiffPanel diff={diffVerdicts(verdict(), worse)} />);
    const sides = screen.getAllByTestId("verdict-diff-side");
    expect(sides[1]).toHaveTextContent("Reused listing photo");
    expect(sides[1]).toHaveTextContent("new");
  });

  it("says plainly when the second review found the same things", () => {
    const same = verdict({ flags: [flag("URGENCY_PRESSURE")] });
    render(<VerdictDiffPanel diff={diffVerdicts(same, { ...same, createdAt: "2026-10-09T12:00:00.000Z" })} />);
    expect(screen.queryByTestId("verdict-diff-lines")).not.toBeInTheDocument();
    expect(screen.getByText("Nothing. The second review found the same things as the first.")).toBeInTheDocument();
  });
});
