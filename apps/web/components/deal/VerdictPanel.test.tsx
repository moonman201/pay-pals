import { fakeSlab, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictPanel } from "./VerdictPanel";

const flag = (code: RedFlag["code"], severity: RedFlag["severity"]): RedFlag => ({ code, severity, evidence: "e", explanation: "x", raisedByRule: true });

function verdict(overrides: Partial<Verdict> = {}): Verdict {
  return { dealId: "d1", cardVersion: 1, overall: "stop", flags: [], priceCheck: null, questionsForSeller: [], palMessage: "Stop.", createdAt: new Date().toISOString(), ...overrides };
}

describe("VerdictPanel", () => {
  it("shows the cert check with the card's grade once and the record's grade once", () => {
    const v = verdict({
      flags: [flag("CERT_MISMATCH", "stop")],
      certCheck: { record: fakeSlab.certRecord!, matches: false, explanation: "PSA's record for this cert is a different card and grade." },
    });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} cardTitle={fakeSlab.cards[0]!.title} cardGrade="PSA 10" />);
    const block = screen.getByTestId("cert-check");
    expect(block).toHaveTextContent(/Cert 81234567/);
    expect(block).toHaveTextContent(/does not match the card/);
    expect(block).toHaveTextContent("Card says PSA 10. PSA (demo record) record says 2016 Pokemon XY Evolutions Charizard Holo #11, grade 7.");
    expect(block.textContent?.match(/PSA 10/g)?.length).toBe(2); // once in the sentence, once inside the card title line
    expect(block).not.toHaveTextContent("PSA 10, PSA 10");
    expect(screen.getByText("a grading cert that does not match PSA's record")).toBeInTheDocument();
  });

  it("says the record agrees on a match", () => {
    const v = verdict({ overall: "go", certCheck: { record: { ...fakeSlab.certRecord!, provider: "psa", subject: "1999 Pokemon Game Charizard Holo #4", grade: "10" }, matches: true, explanation: "Matches." } });
    render(<VerdictPanel verdict={v} currentVersion={1} locked={false} cardGrade="PSA 10" />);
    expect(screen.getByTestId("cert-check")).toHaveTextContent("PSA record agrees: PSA 10");
  });

  it("renders each flag as three separate elements: severity pill, category word, no-override marker", () => {
    render(<VerdictPanel verdict={verdict({ cardVersion: 0, flags: [flag("INVITE_REFUSED", "stop")] })} currentVersion={0} locked={false} />);
    const row = screen.getByTestId("flag-badges");
    const parts = within(row).getAllByText(/stop|the seller refused Pay Pals protection|no override/);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.textContent)).toEqual(["stop", "the seller refused Pay Pals protection", "no override"]);
    expect(new Set(parts).size).toBe(3);
    for (const part of parts) {
      expect(part.className).toMatch(/border/);
      expect(part.parentElement).toBe(row);
    }
    expect(row.className).toMatch(/gap-/);
    expect(screen.queryByTestId("cert-check")).not.toBeInTheDocument();
    expect(screen.queryByText(/needs another look/)).not.toBeInTheDocument();
  });

  it("omits the no-override marker for a caution flag", () => {
    render(<VerdictPanel verdict={verdict({ overall: "caution", flags: [flag("URGENCY_PRESSURE", "caution")] })} currentVersion={1} locked={false} />);
    const row = screen.getByTestId("flag-badges");
    expect(within(row).queryByText("no override")).not.toBeInTheDocument();
    expect(within(row).getByText("caution")).toBeInTheDocument();
    expect(within(row).getByText("pressure to pay now")).toBeInTheDocument();
  });
});
