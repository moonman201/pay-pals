import type { DealEvent } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressStepper } from "./ProgressStepper";

const ev = (kind: DealEvent["kind"]): DealEvent => ({ id: kind, dealId: "d", kind, actor: "system", summary: kind, at: "2026-10-01T00:00:00.000Z", prevHash: null, hash: "0".repeat(64) }) as DealEvent;

describe("ProgressStepper", () => {
  it("lists the seven steps with the current one marked", () => {
    render(<ProgressStepper state="REVIEWED" events={[]} />);
    const nav = screen.getByRole("navigation", { name: "Deal progress" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items.map((li) => li.getAttribute("data-status"))).toEqual(["done", "done", "done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(items[3]).toHaveAttribute("aria-current", "step");
    expect(within(items[3]!).getByText("Agreed and locked")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-end")).not.toBeInTheDocument();
  });

  it("puts the end badge right after the last step a blocked deal reached", () => {
    render(<ProgressStepper state="BLOCKED" events={[ev("seller_invited"), ev("card_updated"), ev("review_posted")]} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[2]!).getByTestId("progress-end")).toHaveTextContent("Blocked");
    expect(items.some((li) => li.getAttribute("aria-current") === "step")).toBe(false);
  });

  it("wraps instead of scrolling, so no step is clipped on a phone", () => {
    render(<ProgressStepper state="PAID" events={[]} />);
    const nav = screen.getByTestId("progress-stepper");
    expect(nav.className).not.toContain("overflow-x");
    expect(nav.querySelector("ol")?.className).toContain("flex-wrap");
    expect(nav.querySelector("ol")?.className).not.toContain("min-w-max");
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("shows Issue open after Arrived when the issue came after delivery", () => {
    render(<ProgressStepper state="ISSUE" events={[ev("card_locked"), ev("payment_captured"), ev("shipped"), ev("delivered"), ev("arrival_checked")]} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[6]!).getByTestId("progress-end")).toHaveTextContent("Issue open");
  });
});
