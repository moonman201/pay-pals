/**
 * The landing's links, and the one invariant that matters about them.
 *
 * Matt opened production and got three dead "See the finished deal" links
 * pointing at ids that had been swept hours earlier. The page he was holding
 * was correct when it was rendered; it just outlived the deals it named. Any
 * href with a deal id in it has that failure built in, because a cache, a
 * tab, a bookmark, a screenshot in the video and an open judge's window all
 * keep whatever id was printed, and one re-seed later it is dead.
 *
 * So: no href on the landing carries a deal id. The route resolves the deal
 * at request time instead. This test is here because that is exactly the
 * kind of invariant someone undoes by adding a convenient direct link.
 */
import { ALL_FIXTURES } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScenarioCard } from "./ScenarioCard";

/** A deal id as the store makes them, and as they appear in a URL. */
const UUID_IN_PATH = /\/deals\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
/** Wider: anything long and id-shaped after /deals/, so a different id format cannot slip through. */
const ANY_ID_IN_PATH = /\/deals\/(?!finished\/|new\b)[^/?#]{8,}/;

function hrefs(): string[] {
  return screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
}

describe("no landing href carries a deal id", () => {
  it("holds for every scenario card, with a finished deal to link to", () => {
    for (const fixture of ALL_FIXTURES) {
      const { unmount } = render(<ScenarioCard fixture={fixture} hasFinishedDeal />);
      const links = hrefs();
      expect(links.length, fixture.id).toBeGreaterThan(0);
      for (const href of links) {
        expect(href, `${fixture.id}: ${href}`).not.toMatch(UUID_IN_PATH);
        expect(href, `${fixture.id}: ${href}`).not.toMatch(ANY_ID_IN_PATH);
      }
      unmount();
    }
  });

  it("links to the scenario, which is stable, and not to whichever deal is current", () => {
    render(<ScenarioCard fixture={ALL_FIXTURES[0]!} hasFinishedDeal />);
    const link = screen.getByRole("link", { name: /See the finished deal/ });
    expect(link).toHaveAttribute("href", `/deals/finished/${ALL_FIXTURES[0]!.id}?as=buyer`);
  });

  it("offers the link only for a scenario that has a finished deal right now", () => {
    const { unmount } = render(<ScenarioCard fixture={ALL_FIXTURES[0]!} hasFinishedDeal={false} />);
    expect(screen.queryByRole("link", { name: /See the finished deal/ })).not.toBeInTheDocument();
    unmount();
    render(<ScenarioCard fixture={ALL_FIXTURES[0]!} hasFinishedDeal />);
    expect(screen.getByRole("link", { name: /See the finished deal/ })).toBeInTheDocument();
  });

  it("still offers both play buttons either way, so a card is never a dead end", () => {
    for (const hasFinishedDeal of [true, false]) {
      const { unmount } = render(<ScenarioCard fixture={ALL_FIXTURES[1]!} hasFinishedDeal={hasFinishedDeal} />);
      expect(screen.getByRole("button", { name: "Play as buyer" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play as seller" })).toBeInTheDocument();
      unmount();
    }
  });
});

describe("the guard itself", () => {
  it("catches the href this replaced, so it cannot pass by accident", () => {
    const old = "/deals/869d30af-1c2b-4d5e-8f90-123456789abc?as=buyer";
    expect(old).toMatch(UUID_IN_PATH);
    expect(old).toMatch(ANY_ID_IN_PATH);
    // And the shape that replaced it is allowed.
    expect("/deals/finished/clean-ps5?as=buyer").not.toMatch(UUID_IN_PATH);
    expect("/deals/finished/clean-ps5?as=buyer").not.toMatch(ANY_ID_IN_PATH);
    expect("/deals/new").not.toMatch(ANY_ID_IN_PATH);
  });
});
