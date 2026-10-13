import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroHeadline } from "./HeroHeadline";

describe("HeroHeadline", () => {
  it("leads with the buyer's question, word for word", () => {
    render(<HeroHeadline />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Buying a $400 console or a $2,000 card from a stranger? Pay Pals checks the photos, the cert and the chat before you pay.",
    );
  });

  it("keeps the old headline as a smaller line under it, not as a second heading", () => {
    render(<HeroHeadline />);
    expect(screen.getByText("Two AI agents. One safe deal.").tagName).toBe("P");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});
