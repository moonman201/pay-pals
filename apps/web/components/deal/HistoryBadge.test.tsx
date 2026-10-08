import { chainEvents, cleanPs5, type DealEvent } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryBadge } from "./HistoryBadge";

const events: DealEvent[] = chainEvents(cleanPs5.timeline.map(({ prevHash: _p, hash: _h, ...rest }) => rest));
const head = events.find((e) => e.kind === "payment_created")!.hash;

describe("HistoryBadge", () => {
  it("is calm when the chain verifies against the order", () => {
    render(<HistoryBadge events={events} historyHash={head} />);
    const badge = screen.getByTestId("history-badge");
    expect(badge).toHaveTextContent("History unchanged since PayPal order");
    expect(badge).toHaveAttribute("data-status", "verified");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("is a clear warning when an event was edited", () => {
    const edited = events.map((e, i) => (i === 1 ? { ...e, summary: "changed" } : e));
    render(<HistoryBadge events={edited} historyHash={head} />);
    expect(screen.getByRole("alert")).toHaveTextContent("History does not match the hash on the PayPal order");
  });

  it("shows a count and no verdict before any order", () => {
    render(<HistoryBadge events={events.slice(0, 3)} historyHash={null} />);
    expect(screen.getByTestId("history-badge")).toHaveTextContent("History hash-chained, 3 events");
  });
});
