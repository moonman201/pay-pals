import { cleanPs5, fakeSlab } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItemGlance } from "./ItemGlance";

const slab = fakeSlab.cards[fakeSlab.cards.length - 1]!;
const ps5 = cleanPs5.cards[cleanPs5.cards.length - 1]!;

describe("ItemGlance", () => {
  it("calls an unlocked card on a live deal a draft", () => {
    render(<ItemGlance card={slab} lockedVersion={null} />);
    expect(screen.getByTestId("glance-version")).toHaveTextContent("Draft v");
  });

  it("says Never locked, not Draft, once the deal has ended without locking the card", () => {
    render(<ItemGlance card={slab} lockedVersion={null} ended />);
    expect(screen.getByTestId("glance-version")).toHaveTextContent("Never locked");
    expect(screen.getByTestId("glance-version")).not.toHaveTextContent("Draft");
  });

  it("shows the version and the PayPal order line once locked, and the order line is a button that opens the order text", () => {
    render(<ItemGlance card={ps5} lockedVersion={2} ended />);
    expect(screen.getByTestId("glance-version")).toHaveTextContent("v2");
    expect(screen.getByTestId("glance-version")).not.toHaveTextContent("Never locked");
    expect(screen.getByRole("button", { name: "On the PayPal order" })).toBeInTheDocument();
  });

  it("shows the cert and the grade for a slab, and the serial alone for a console", () => {
    const { unmount } = render(<ItemGlance card={slab} lockedVersion={null} />);
    expect(screen.getByText("Cert")).toBeInTheDocument();
    expect(screen.getByText("Grade")).toBeInTheDocument();
    unmount();
    render(<ItemGlance card={ps5} lockedVersion={2} />);
    expect(screen.getByText("Serial")).toBeInTheDocument();
    expect(screen.queryByText("Grade")).not.toBeInTheDocument();
  });
});
