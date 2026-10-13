import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DealSteps } from "./DealSteps";

describe("DealSteps", () => {
  it("numbers each step once: typed number in the text, no list marker beside it", () => {
    render(<DealSteps />);
    const list = screen.getByRole("list");
    expect(list.className).toContain("list-none");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((li, i) => {
      const text = li.textContent ?? "";
      expect(text.startsWith(`${i + 1}. `), text).toBe(true);
      expect(text, "a second number right after the first").not.toMatch(/^\d+\.\s*\d+\./);
    });
  });
});
