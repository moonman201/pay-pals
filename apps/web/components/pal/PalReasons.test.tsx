import type { PalReasoning } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PalReasons } from "./PalReasons";

const full: PalReasoning = {
  checked: ["The serial on the back of the console, against the box label."],
  found: ["Both read AJ164952580."],
  couldNotVerify: ["Whether the seller owns the console."],
  wouldChangeMyMind: ["A photo of the console powered on with the serial in frame."],
};

describe("PalReasons", () => {
  it("renders nothing for a verdict that carries no reasons", () => {
    const { container } = render(<PalReasons reasoning={undefined} pal="buyer" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the four groups, each labelled, with the pal's own sentences", () => {
    render(<PalReasons reasoning={full} pal="buyer" />);
    expect(screen.getAllByTestId("pal-reason-group").map((g) => g.getAttribute("data-group"))).toEqual(["checked", "found", "couldNotVerify", "wouldChangeMyMind"]);
    expect(screen.getByRole("heading", { name: "What I could not check" })).toBeInTheDocument();
    expect(screen.getByText("Whether the seller owns the console.")).toBeInTheDocument();
    expect(screen.getByText("A photo of the console powered on with the serial in frame.")).toBeInTheDocument();
  });

  it("puts what it could not check in the open, never behind a disclosure", () => {
    const { container } = render(<PalReasons reasoning={full} pal="buyer" />);
    expect(container.querySelector("details")).toBeNull();
    const group = screen.getAllByTestId("pal-reason-group").find((g) => g.dataset.group === "couldNotVerify")!;
    expect(group).toBeVisible();
    expect(group.hidden).toBe(false);
  });

  it("says so when the pal could check everything, rather than dropping the group", () => {
    const nothingOpen: PalReasoning = { checked: ["The cert number."], found: ["It matches."], couldNotVerify: [], wouldChangeMyMind: [] };
    render(<PalReasons reasoning={nothingOpen} pal="buyer" />);
    expect(screen.getByText("Nothing. Everything I set out to check, I could check.")).toBeInTheDocument();
  });

  it("renders only the groups the surface asked for", () => {
    render(<PalReasons reasoning={full} pal="buyer" only={["wouldChangeMyMind"]} />);
    expect(screen.getAllByTestId("pal-reason-group")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "What would change my mind" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What I checked" })).not.toBeInTheDocument();
  });
});
