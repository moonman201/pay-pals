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

  it("on an example deal, says the history is chained but that no PayPal order holds it, even with a hash on the fixture payment", () => {
    render(<HistoryBadge events={events} historyHash={head} example />);
    const badge = screen.getByTestId("history-badge");
    expect(badge).toHaveTextContent(`Tamper-evident history, ${events.length} events`);
    expect(badge).toHaveAttribute("data-status", "unanchored");
    expect(screen.queryByText(/unchanged since PayPal order/)).not.toBeInTheDocument();
  });

  it("shows a count and no verdict before any order", () => {
    render(<HistoryBadge events={events.slice(0, 3)} historyHash={null} />);
    expect(screen.getByTestId("history-badge")).toHaveTextContent("Tamper-evident history, 3 events");
  });

  it("wears a seal only once there is a verdict: the side colour when verified, red on a mismatch, none before an order", () => {
    const { container, unmount } = render(<HistoryBadge events={events} historyHash={head} />);
    expect(container.querySelector('svg[class~="text-[var(--accent)]"]')).not.toBeNull();
    unmount();
    const edited = events.map((e, i) => (i === 1 ? { ...e, summary: "changed" } : e));
    const red = render(<HistoryBadge events={edited} historyHash={head} />);
    expect(red.container.querySelector("svg.text-stop")).not.toBeNull();
    red.unmount();
    const plain = render(<HistoryBadge events={events.slice(0, 3)} historyHash={null} />);
    expect(plain.container.querySelector("svg")).toBeNull();
  });
});
