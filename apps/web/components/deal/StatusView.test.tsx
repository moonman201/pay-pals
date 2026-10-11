import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS_LEGEND, type StatusGroup } from "@/lib/deal/status-view";
import { StatusView } from "./StatusView";

const live = { state: "PAID" as const };

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
  it("says what the four labels mean before it uses them", () => {
    render(<StatusView groups={groups} deal={live} />);
    expect(screen.getByTestId("status-legend")).toHaveTextContent(STATUS_LEGEND);
  });

  it("renders a group per section and a labelled line per item", () => {
    render(<StatusView groups={groups} deal={live} />);
    expect(screen.getAllByTestId("status-group")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "The agreed item card" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Payment/ })).not.toBeInTheDocument();
    const items = screen.getAllByTestId("status-item");
    expect(items.map((i) => i.getAttribute("data-status"))).toEqual(["verified", "unverified", "missing"]);
    expect(items[0]).toHaveTextContent("Version 2, locked. Both sides agreed to that version.");
  });

  it("uses only the four words, never a fifth", () => {
    const flagged: StatusGroup[] = [
      { ...groups[0]!, items: [...groups[0]!.items, { id: "cert", label: "Cert", status: "flagged", detail: "Checked against PSA and it is a different card." }] },
      groups[1]!,
    ];
    render(<StatusView groups={flagged} deal={live} />);
    const words = screen.getAllByTestId("status-chip").map((c) => c.textContent);
    expect(words).toEqual(["Verified", "Unverified", "Flagged", "Missing"]);
  });

  it("counts the labels in the panel header, flagged first because it is the one that needs reading", () => {
    const flagged: StatusGroup[] = [
      { ...groups[0]!, items: [...groups[0]!.items, { id: "cert", label: "Cert", status: "flagged", detail: "A different card." }] },
      groups[1]!,
    ];
    render(<StatusView groups={flagged} deal={live} />);
    const counts = screen.getByTestId("status-counts");
    expect(counts).toHaveTextContent("1 flagged");
    expect(counts).toHaveTextContent("1 verified");
    expect(counts).toHaveTextContent("1 unverified");
    expect(counts).toHaveTextContent("1 missing");
    expect(counts.textContent?.indexOf("flagged")).toBeLessThan(counts.textContent!.indexOf("verified"));
  });

  it("gives a flagged line the stop colour, so it does not read like a line carrying no news", () => {
    const flagged: StatusGroup[] = [{ ...groups[0]!, items: [{ id: "cert", label: "Cert", status: "flagged", detail: "A different card." }] }];
    render(<StatusView groups={flagged} deal={live} />);
    expect(screen.getByTestId("status-chip").className).toContain("text-stop");
    expect(screen.getByTestId("status-item").className).toContain("border-l-stop-line");
  });

  it("points at the panel that prints a dropped row in full, rather than printing it again", () => {
    const withNote: StatusGroup[] = [
      { ...groups[0]!, note: { text: "The Buyer Pal raised 3 flags on card version 1.", href: "#buyer-pal-review", linkText: "Read them in the review" } },
      groups[1]!,
    ];
    render(<StatusView groups={withNote} deal={live} />);
    const note = screen.getByTestId("status-note");
    expect(note).toHaveTextContent("The Buyer Pal raised 3 flags on card version 1.");
    expect(screen.getByRole("link", { name: "Read them in the review" })).toHaveAttribute("href", "#buyer-pal-review");
  });

  it("collapses the trailing stages nobody reached into one line", () => {
    render(<StatusView groups={groups} deal={{ state: "BLOCKED" }} />);
    expect(screen.getAllByTestId("status-group")).toHaveLength(1);
    const skipped = screen.getByTestId("status-skipped");
    expect(skipped).toHaveTextContent("Not reached: payment.");
    expect(skipped).toHaveTextContent("This deal ended before payment, so no money moved.");
  });

  it("keeps an empty stage on the page when the deal's state says it happened", () => {
    // A paid deal with no payment rows is a fault, and collapsing it would hide
    // the one thing the view exists to show. The state vetoes the collapse.
    render(<StatusView groups={groups} deal={{ state: "PAID" }} />);
    expect(screen.getAllByTestId("status-group")).toHaveLength(2);
    expect(screen.queryByTestId("status-skipped")).not.toBeInTheDocument();
  });

  it("counts only what is on the page, so the chips and the rows reconcile", () => {
    render(<StatusView groups={groups} deal={{ state: "BLOCKED" }} />);
    // The payment group collapsed, so its one Missing row is not counted either.
    expect(screen.getByTestId("status-counts")).not.toHaveTextContent("missing");
    expect(screen.getAllByTestId("status-item")).toHaveLength(2);
  });
});
