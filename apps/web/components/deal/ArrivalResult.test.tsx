import { cleanPs5, emptyBox, type ArrivalCheck } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrivalResult, arrivalRows } from "./ArrivalResult";

const card = emptyBox.cards[0]!;

function check(overrides: Partial<ArrivalCheck> = {}): ArrivalCheck {
  return {
    dealId: "d",
    cardVersion: 1,
    matches: false,
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
    const rows = arrivalRows(check({ matches: true, mismatches: [], observed: { brand: clean.brand, model: clean.model, serial: clean.serial } }), clean);
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
});
