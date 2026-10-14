import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BUILT_WITH, HowItsBuilt } from "./HowItsBuilt";

const REPO = resolve(__dirname, "../../../..");

describe("HowItsBuilt", () => {
  it("lists the seven things that are real as short labels, each with its line one tap away", () => {
    const { container } = render(<HowItsBuilt />);
    expect(screen.getByRole("heading", { name: "How it's built" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    for (const item of BUILT_WITH) {
      expect(item.short.split(" ").length, item.id).toBeLessThanOrEqual(3);
      expect(container.textContent ?? "").toContain(item.line);
    }
    fireEvent.click(screen.getByTestId("built-psa"));
    expect(container.querySelector("[data-deck-detail='psa']")).not.toHaveAttribute("hidden");
  });

  it("never names the Disputes API, and says only 'dispute webhook' about disputes", () => {
    const text = BUILT_WITH.map((b) => b.line).join("\n");
    expect(text).not.toMatch(/disputes api|disputes endpoint|resolution center/i);
    const mentions = text.match(/dispute\w*/gi) ?? [];
    expect(mentions).toHaveLength(1);
    expect(text).toMatch(/dispute webhook/);
  });

  it("calls the history chip Tamper-proof history, and the line behind it still says what is true", () => {
    const chain = BUILT_WITH.find((b) => b.id === "chain")!;
    expect(chain.short).toBe("Tamper-proof history");
    expect(chain.line).toMatch(/hash-chained/);
    expect(chain.line).toMatch(/chain head goes into the order's custom_id/);
  });

  it("labels the PSA check as a demo record", () => {
    expect(BUILT_WITH.find((b) => b.id === "psa")!.line).toMatch(/demo PSA record/);
  });

  it("points every line at a file or folder that exists", () => {
    for (const item of BUILT_WITH) {
      for (const part of item.backedBy.split(", ")) {
        const path = part;
        expect(existsSync(resolve(REPO, path)), `${item.id}: ${path}`).toBe(true);
      }
    }
  });

  it("carries no em dash", () => {
    expect(BUILT_WITH.map((b) => b.line).join("")).not.toContain("\u2014");
  });
});
