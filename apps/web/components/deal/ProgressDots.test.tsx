import type { DealEvent, DealEventKind } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressDots } from "./ProgressDots";

const ev = (kind: DealEventKind): DealEvent =>
  ({ id: kind, dealId: "d", kind, actor: "system", summary: kind, at: "2026-10-01T00:00:00.000Z", prevHash: null, hash: "0".repeat(64) }) as DealEvent;

describe("ProgressDots", () => {
  it("names all seven segments for a screen reader and says the status in text, not colour", () => {
    render(<ProgressDots state="BLOCKED" events={[ev("seller_invited"), ev("card_updated"), ev("review_posted")]} />);
    const group = screen.getByRole("group");
    expect(group).toHaveAccessibleName("Deal progress: Stopped at Reviewed");
    const items = within(group).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Invited, done",
      "Card, done",
      "Reviewed, done",
      "Agreed, not reached",
      "Paid, not reached",
      "Shipped, not reached",
      "Arrived, not reached",
    ]);
    expect(screen.getByTestId("progress-status")).toHaveTextContent("Stopped at Reviewed");
  });

  it("marks the current segment, and says an issue where it happened", () => {
    const { unmount } = render(<ProgressDots state="PAID" events={[]} />);
    expect(screen.getByTestId("progress-status")).toHaveTextContent("Paid");
    expect(document.querySelector("[aria-current='step']")).toHaveTextContent("Shipped, current");
    unmount();
    render(<ProgressDots state="ISSUE" events={[ev("arrival_checked")]} />);
    expect(screen.getByTestId("progress-status")).toHaveTextContent("Issue at Arrived");
  });

  it("gives an unreached segment a different shape as well as a different colour", () => {
    render(<ProgressDots state="REVIEWED" events={[]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]!.className).not.toBe(items[6]!.className);
    expect(items[6]!.className).toContain("border-dashed");
  });
});
