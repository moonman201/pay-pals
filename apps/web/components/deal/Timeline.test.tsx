import { emptyBox } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";

describe("Timeline", () => {
  it("attributes the empty-box issue note to the buyer, not the Buyer Pal who ran the arrival check", () => {
    render(<Timeline deal={emptyBox.deal} events={emptyBox.timeline} />);
    const note = screen
      .getAllByTestId("timeline-note")
      .find((n) => n.textContent?.includes("The box arrived empty"))!;
    expect(note).toBeTruthy();
    const who = within(note).getByTestId("timeline-note-actor").textContent!;
    expect(who).toContain(emptyBox.deal.buyer?.displayName ?? "Buyer");
    expect(who).not.toContain("Buyer Pal");
    // The row itself still belongs to the pal, who did run the check.
    const row = note.closest("[data-testid='timeline-row']")!;
    expect(row.textContent).toContain("arrival check");
    expect(row.textContent).toContain("Buyer Pal");
  });
});
