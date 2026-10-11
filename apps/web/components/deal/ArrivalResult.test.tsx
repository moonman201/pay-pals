import { cleanPs5, emptyBox, type ArrivalCheck } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrivalResult, arrivalRows } from "./ArrivalResult";

// The locked card a buyer checks an arrival against carries the serial read off the item.
const card = { ...emptyBox.cards[0]!, serial: emptyBox.cards[0]!.boxSerial ?? null };

function check(overrides: Partial<ArrivalCheck> = {}): ArrivalCheck {
  return {
    dealId: "d",
    cardVersion: 1,
    outcome: "mismatch",
    mismatches: [{ field: "serial", expected: card.serial!, observed: "not readable in the arrival photos", explanation: "No serial could be read." }],
    observed: { brand: null, model: "PlayStation 5", serial: null },
    palMessage: "The box arrived with no console inside.",
    createdAt: "2026-10-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("arrivalRows", () => {
  it("compares the locked card to what arrived, one row per field, mismatches from the pal's list", () => {
    const rows = arrivalRows(check(), card);
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["brand", "unknown"],
      ["model", "match"],
      ["serial", "mismatch"],
    ]);
    expect(rows[2]!.left).toBe(card.serial);
    expect(rows[2]!.right).toBe("not readable in the arrival photos");
    expect(rows[0]!.right).toBe("not readable");
  });

  it("adds a row for a mismatch outside the three read fields", () => {
    const rows = arrivalRows(check({ mismatches: [{ field: "other", expected: "console in the box", observed: "foam insert only", explanation: "Empty." }] }), card);
    expect(rows.at(-1)).toMatchObject({ label: "other", status: "mismatch", left: "console in the box", right: "foam insert only" });
  });

  it("matches every read field on a clean arrival", () => {
    const clean = cleanPs5.cards[1]!;
    const rows = arrivalRows(check({ outcome: "match", mismatches: [], observed: { brand: clean.brand, model: clean.model, serial: clean.serial } }), clean);
    expect(rows.every((r) => r.status === "match")).toBe(true);
  });
});

describe("ArrivalResult", () => {
  it("renders the comparison as a table with the mismatch row on the stop colour", () => {
    render(<ArrivalResult check={check()} lockedCard={card} />);
    expect(screen.getByText("does not match")).toBeInTheDocument();
    const serialRow = screen.getAllByRole("row").find((r) => r.textContent?.includes("serial"))!;
    expect(serialRow).toHaveAttribute("data-status", "mismatch");
    expect(within(serialRow).getByText(card.serial!)).toBeInTheDocument();
  });

  it("renders all four of the pal's reason groups under the comparison", () => {
    const withReasons = {
      ...check(),
      reasoning: {
        checked: ["The arrival photos against locked card version 1."],
        found: ["The box is there and the console is not."],
        couldNotVerify: ["What was in the box when it left the seller."],
        wouldChangeMyMind: ["A packing photo showing the console inside the box."],
      },
    };
    render(<ArrivalResult check={withReasons} lockedCard={card} />);
    expect(screen.getAllByTestId("pal-reason-group").map((g) => g.getAttribute("data-group"))).toEqual(["checked", "found", "couldNotVerify", "wouldChangeMyMind"]);
    expect(screen.getByText("What was in the box when it left the seller.")).toBeInTheDocument();
  });

  it("renders exactly as it did for an arrival check with no reasons on it", () => {
    render(<ArrivalResult check={check()} lockedCard={card} />);
    expect(screen.queryByTestId("pal-reasons")).not.toBeInTheDocument();
  });
});

describe("an arrival the pal could not settle", () => {
  const nearMiss = {
    field: "serial" as const,
    expected: "AJ164952580",
    observed: "AJ16495258O",
    explanation: "They differ only at character 11, 0 against O, which is what a misread of one character looks like.",
  };
  const unsettledCheck = () =>
    check({
      outcome: "inconclusive",
      mismatches: [],
      unsettled: [nearMiss],
      observed: { brand: "Sony", model: "PlayStation 5", serial: "AJ16495258O" },
      palMessage: "I cannot tell whether those are the same number.",
    });

  it("wears a third badge that is neither a pass nor a failure", () => {
    render(<ArrivalResult check={unsettledCheck()} lockedCard={card} />);
    const badge = screen.getByTestId("arrival-outcome");
    expect(badge).toHaveTextContent("not settled");
    expect(badge.className).toMatch(/caution/);
    expect(badge.className).not.toMatch(/stop|go/);
    expect(screen.getByTestId("arrival-result")).toHaveAttribute("data-outcome", "inconclusive");
  });

  it("never shows the red does-not-match claim the band exists to prevent", () => {
    render(<ArrivalResult check={unsettledCheck()} lockedCard={card} />);
    expect(screen.queryByText("does not match")).not.toBeInTheDocument();
    expect(screen.queryByText("matches")).not.toBeInTheDocument();
  });

  it("puts the unsettled serial row on the caution colour, not the stop colour", () => {
    render(<ArrivalResult check={unsettledCheck()} lockedCard={card} />);
    const serialRow = screen.getAllByRole("row").find((r) => r.textContent?.includes("serial"))!;
    expect(serialRow).toHaveAttribute("data-status", "unsettled");
    expect(serialRow.className).toMatch(/caution/);
    expect(serialRow.className).not.toMatch(/stop-soft/);
  });

  it("says it is claiming neither thing, names both numbers, and asks for a clearer photo", () => {
    render(<ArrivalResult check={unsettledCheck()} lockedCard={card} />);
    const note = screen.getByTestId("arrival-unsettled");
    expect(note).toHaveTextContent("not calling that a match and not calling it a mismatch");
    expect(note).toHaveTextContent("clearer photo of that label");
    expect(note).toHaveTextContent("AJ164952580");
    expect(note).toHaveTextContent("AJ16495258O");
  });

  it("shows the note only for an unsettled check", () => {
    const { unmount } = render(<ArrivalResult check={check()} lockedCard={card} />);
    expect(screen.queryByTestId("arrival-unsettled")).not.toBeInTheDocument();
    unmount();
    render(<ArrivalResult check={check({ outcome: "match", mismatches: [] })} lockedCard={card} />);
    expect(screen.queryByTestId("arrival-unsettled")).not.toBeInTheDocument();
  });

  it("keeps an unsettled field out of the match column, so it cannot fall through to a pass", () => {
    const rows = arrivalRows(unsettledCheck(), card);
    const serial = rows.find((r) => r.label === "serial")!;
    expect(serial.status).toBe("unsettled");
    expect(serial.left).toBe("AJ164952580");
    expect(serial.right).toBe("AJ16495258O");
    expect(serial.note).toBe(nearMiss.explanation);
  });
});
