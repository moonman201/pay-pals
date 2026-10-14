import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroHeadline } from "./HeroHeadline";

describe("HeroHeadline", () => {
  it("leads with Matt's line, word for word", () => {
    render(<HeroHeadline />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Don't get scammed buying from strangers.");
  });

  it("says what the pals do in one small line under it, not as a second heading", () => {
    render(<HeroHeadline />);
    expect(screen.getByText("Two AI pals check the photos, the cert and the chat before you pay.").tagName).toBe("P");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it('keeps "Two AI agents. One safe deal." out of the hero', () => {
    const { container } = render(<HeroHeadline />);
    expect(container.textContent).not.toContain("One safe deal");
  });
});
