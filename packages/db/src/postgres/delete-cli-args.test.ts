/**
 * The delete script's command line. These cases are about not deleting the
 * wrong thing: a flag read as a value, an id list that silently loses an
 * entry, or --keep-seed looking like it protects a by-id run when it does not.
 */
import { describe, expect, it } from "vitest";
import { parseDeleteCliArgs } from "./delete-cli-args";

const ID_A = "3e28036c-77f1-49e1-9f5d-f9184fcdbf84";
const ID_B = "73c44fa0-0000-4000-8000-000000000001";

describe("parseDeleteCliArgs", () => {
  it("defaults to the sweep, listing only", () => {
    expect(parseDeleteCliArgs([])).toEqual({ mode: "sweep", keepSeedVersion: null, yes: false });
  });

  it("reads the sweep's keep-seed in both spellings, and --yes", () => {
    expect(parseDeleteCliArgs(["--keep-seed", "2026-10-08.1"])).toEqual({ mode: "sweep", keepSeedVersion: "2026-10-08.1", yes: false });
    expect(parseDeleteCliArgs(["--keep-seed=2026-10-08.1", "--yes"])).toEqual({ mode: "sweep", keepSeedVersion: "2026-10-08.1", yes: true });
  });

  it("collects each --id as its own flag, in order, in both spellings", () => {
    expect(parseDeleteCliArgs(["--id", ID_A, "--id", ID_B])).toEqual({ mode: "by-id", ids: [ID_A, ID_B], yes: false });
    expect(parseDeleteCliArgs([`--id=${ID_A}`, "--id", ID_B, "--yes"])).toEqual({ mode: "by-id", ids: [ID_A, ID_B], yes: true });
  });

  it("never treats a following flag as an id, so a left-out id is an error and not a silent --yes delete", () => {
    expect(parseDeleteCliArgs(["--id", "--yes"])).toMatchObject({ mode: "error" });
    expect(parseDeleteCliArgs(["--id"])).toMatchObject({ mode: "error" });
    expect(parseDeleteCliArgs(["--id="])).toMatchObject({ mode: "error" });
    // The same for the other value flags.
    expect(parseDeleteCliArgs(["--keep-seed", "--yes"])).toMatchObject({ mode: "error" });
    expect(parseDeleteCliArgs(["--explain", "--yes"])).toMatchObject({ mode: "error" });
  });

  it("refuses --keep-seed together with --id, because it protects nothing there", () => {
    const parsed = parseDeleteCliArgs(["--id", ID_A, "--keep-seed", "2026-10-08.1", "--yes"]);
    expect(parsed.mode).toBe("error");
    expect(parsed).toMatchObject({ message: expect.stringContaining("no effect with --id") });
  });

  it("lets --explain answer first, since it only reads", () => {
    expect(parseDeleteCliArgs(["--explain", ID_A, "--yes"])).toEqual({ mode: "explain", dealId: ID_A, keepSeedVersion: null });
    // Even alongside --id, nothing is deleted.
    expect(parseDeleteCliArgs(["--id", ID_B, "--explain", ID_A, "--yes"])).toEqual({ mode: "explain", dealId: ID_A, keepSeedVersion: null });
  });

  it("passes a shortened id through to be refused later, rather than accepting it here", () => {
    // Parsing does not judge the shape; delete-deals-by-id refuses a non-uuid.
    expect(parseDeleteCliArgs(["--id", "73c44fa0"])).toEqual({ mode: "by-id", ids: ["73c44fa0"], yes: false });
  });
});
