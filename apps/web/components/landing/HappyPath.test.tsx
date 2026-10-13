import { ALL_FIXTURES } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { happyPath, inputFromFixture } from "./happy-path";
import { ScenarioCard } from "./ScenarioCard";

const clean = ALL_FIXTURES.find((f) => f.id === "clean-ps5")!;
const slab = ALL_FIXTURES.find((f) => f.id === "fake-slab")!;

describe("the clean card's path", () => {
  it("shows the five labelled steps in order", () => {
    render(<ScenarioCard fixture={clean} hasFinishedDeal path={happyPath(inputFromFixture(clean))} />);
    const row = screen.getByRole("list", { name: "How this deal went" });
    expect(Array.from(row.querySelectorAll("li")).map((li) => li.textContent?.replace("→", "").trim())).toEqual(["Caution", "Looks good", "Paid", "Shipped", "Matched"]);
  });

  it("is absent on a card given no path, so the other two cards are unchanged", () => {
    render(<ScenarioCard fixture={slab} hasFinishedDeal />);
    expect(screen.queryByRole("list", { name: "How this deal went" })).not.toBeInTheDocument();
  });
});
