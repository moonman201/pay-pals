import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BUILT_WITH, HowItsBuilt } from "./HowItsBuilt";

const REPO = resolve(__dirname, "../../../..");

describe("HowItsBuilt", () => {
  it("lists the seven things that are real, one line each", () => {
    render(<HowItsBuilt />);
    expect(screen.getByRole("heading", { name: "How it's built" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("never names the Disputes API, and says only 'dispute webhook' about disputes", () => {
    const text = BUILT_WITH.map((b) => b.line).join("\n");
    expect(text).not.toMatch(/disputes api|disputes endpoint|resolution center/i);
    const mentions = text.match(/dispute\w*/gi) ?? [];
    expect(mentions).toHaveLength(1);
    expect(text).toMatch(/dispute webhook/);
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
    expect(BUILT_WITH.map((b) => b.line).join("")).not.toContain("—");
  });
});
