import { cleanGarmin } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ItemCardView } from "./ItemCardView";

const [v1, v2] = cleanGarmin.cards;
if (!v1 || !v2) throw new Error("fixture needs two card versions");
const unlocked = [v1, { ...v2, lockedAt: null }];

describe("ItemCardView", () => {
  it("shows version history while the card is open and lets you look back", async () => {
    render(<ItemCardView cards={unlocked} currentVersion={2} lockedVersion={null} />);
    expect(screen.getByRole("tab", { name: "Version 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Version 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Battery holds about 11 days/)).toBeInTheDocument();
    expect(screen.getByText(/Changed from version 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Version 1" }));
    expect(screen.queryByText(/Battery holds about 11 days/)).not.toBeInTheDocument();
    expect(screen.getByText("Photos (2)")).toBeInTheDocument();
  });

  it("shows the locked badge and hides the version switcher once locked", () => {
    render(<ItemCardView cards={cleanGarmin.cards} currentVersion={2} lockedVersion={2} />);
    expect(screen.getByText("Locked, version 2")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing on it can change/)).toBeInTheDocument();
  });

  it("renders the serial, condition and payee from the card", () => {
    render(<ItemCardView cards={[v1]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("7LP045912")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("luis.o@example.com")).toBeInTheDocument();
  });
});
