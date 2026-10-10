import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS_LEGEND, type StatusGroup } from "@/lib/deal/status-view";
import { StatusView } from "./StatusView";

const groups: StatusGroup[] = [
  {
    id: "card",
    title: "The agreed item card",
    items: [
      { id: "card-locked", label: "Item card locked", status: "verified", detail: "Version 2, locked. Both sides agreed to that version." },
      { id: "both-agreed", label: "Both sides agreed to the same version", status: "unverified", detail: "The buyer agreed. The seller has not." },
    ],
  },
  {
    id: "payment",
    title: "Payment confirmed by PayPal",
    items: [{ id: "order", label: "Order at PayPal", status: "missing", detail: "No PayPal order has been created for this deal." }],
  },
];

describe("StatusView", () => {
  it("says what the three labels mean before it uses them", () => {
    render(<StatusView groups={groups} />);
    expect(screen.getByTestId("status-legend")).toHaveTextContent(STATUS_LEGEND);
  });

  it("renders a group per section and a labelled line per item", () => {
    render(<StatusView groups={groups} />);
    expect(screen.getAllByTestId("status-group")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "The agreed item card" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Payment/ })).not.toBeInTheDocument();
    const items = screen.getAllByTestId("status-item");
    expect(items.map((i) => i.getAttribute("data-status"))).toEqual(["verified", "unverified", "missing"]);
    expect(items[0]).toHaveTextContent("Version 2, locked. Both sides agreed to that version.");
  });

  it("uses only the three words, never a fourth", () => {
    render(<StatusView groups={groups} />);
    const words = screen.getAllByTestId("status-chip").map((c) => c.textContent);
    expect(words).toEqual(["Verified", "Unverified", "Missing"]);
  });

  it("counts the labels in the panel header", () => {
    render(<StatusView groups={groups} />);
    const counts = screen.getByTestId("status-counts");
    expect(counts).toHaveTextContent("1 verified");
    expect(counts).toHaveTextContent("1 unverified");
    expect(counts).toHaveTextContent("1 missing");
  });
});
