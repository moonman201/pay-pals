/**
 * The delete script's command line. These cases are about not deleting the
 * wrong thing: a flag read as a value, an id list that silently loses an
 * entry, an argument that never resolved into a flag at all, or --keep-seed
 * looking like it protects a by-id run when it does not.
 *
 * The unsplit-list cases are built as a single string on purpose. That is the
 * real shape of the Oct 11 near-miss, and a test written from a clean array of
 * arguments will never see it.
 */
import { describe, expect, it } from "vitest";
import { parseDeleteCliArgs } from "./delete-cli-args";

const ID_A = "3e28036c-77f1-49e1-9f5d-f9184fcdbf84";
const ID_B = "73c44fa0-0000-4000-8000-000000000001";
const SEED = "2026-10-08.1";

describe("parseDeleteCliArgs", () => {
  describe("the near-miss: an argument list that arrived as one argument", () => {
    // What `ARGS=$(sed 's/^/--id /' ids.txt | paste -sd' ' -)` then `-- $ARGS` sends in zsh.
    const blob = `--id ${ID_A} --id ${ID_B}`;

    it("refuses a single argument holding the whole list instead of sweeping", () => {
      const parsed = parseDeleteCliArgs([blob]);
      expect(parsed.mode).toBe("error");
      // The old parser matched no ids here and fell through to the sweep.
      expect(parsed).not.toMatchObject({ mode: "sweep" });
    });

    it("says it is a word-splitting problem, because that is the actual fix", () => {
      const parsed = parseDeleteCliArgs([blob]);
      expect(parsed).toMatchObject({ message: expect.stringContaining("${=ARGS}") });
      expect(parsed).toMatchObject({ message: expect.stringContaining("Nothing was deleted") });
    });

    it("refuses it just the same with --yes, which is the run that would have destroyed the seeds", () => {
      expect(parseDeleteCliArgs([blob, "--yes"]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--yes", blob]).mode).toBe("error");
    });

    it("does not print the whole list back when it is long", () => {
      const long = Array.from({ length: 28 }, (_, i) => `--id ${ID_A.slice(0, -2)}${String(i).padStart(2, "0")}`).join(" ");
      const parsed = parseDeleteCliArgs([long]);
      expect(parsed.mode).toBe("error");
      if (parsed.mode !== "error") throw new Error("expected an error");
      expect(parsed.message.length).toBeLessThan(400);
    });
  });

  describe("every argument has to be recognised", () => {
    it("refuses a misspelled flag rather than ignoring it and sweeping with nothing kept", () => {
      // The same family as the near-miss, with no "--id" in it anywhere.
      const parsed = parseDeleteCliArgs(["--kep-seed", SEED, "--sweep", "--yes"]);
      expect(parsed.mode).toBe("error");
      expect(parsed).toMatchObject({ message: expect.stringContaining("Unrecognised argument") });
    });

    it("refuses a bare uuid with no flag", () => {
      expect(parseDeleteCliArgs([ID_A]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--sweep", ID_A]).mode).toBe("error");
    });

    it("refuses an unknown flag even beside a valid mode", () => {
      expect(parseDeleteCliArgs(["--id", ID_A, "--force"]).mode).toBe("error");
    });
  });

  describe("the mode is named, never inferred", () => {
    it("does nothing when no mode is given, where it used to sweep", () => {
      for (const argv of [[], ["--yes"], ["--keep-seed", SEED], ["--keep-seed", SEED, "--yes"]]) {
        const parsed = parseDeleteCliArgs(argv);
        expect(parsed.mode, argv.join(" ")).toBe("error");
        expect(parsed).toMatchObject({ message: expect.stringContaining("No mode given") });
      }
    });

    it("refuses two modes in one run rather than picking one", () => {
      expect(parseDeleteCliArgs(["--id", ID_A, "--sweep"]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--explain", ID_A, "--id", ID_B]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--explain", ID_A, "--sweep"]).mode).toBe("error");
    });
  });

  describe("the sweep", () => {
    it("lists without --yes, needing nothing else", () => {
      expect(parseDeleteCliArgs(["--sweep"])).toEqual({ mode: "sweep", keepSeedVersion: null, yes: false });
      expect(parseDeleteCliArgs(["--sweep", "--keep-seed", SEED])).toEqual({ mode: "sweep", keepSeedVersion: SEED, yes: false });
    });

    it("deletes only when it says what it keeps", () => {
      expect(parseDeleteCliArgs(["--sweep", "--keep-seed", SEED, "--yes"])).toEqual({ mode: "sweep", keepSeedVersion: SEED, yes: true });
      expect(parseDeleteCliArgs([`--sweep`, `--keep-seed=${SEED}`, "--yes"])).toEqual({ mode: "sweep", keepSeedVersion: SEED, yes: true });
    });

    it("refuses a deleting sweep that does not say what it keeps, because that silently keeps nothing", () => {
      const parsed = parseDeleteCliArgs(["--sweep", "--yes"]);
      expect(parsed.mode).toBe("error");
      expect(parsed).toMatchObject({ message: expect.stringContaining("--keep-seed") });
    });

    it("takes --keep-seed none as the spelled-out way to delete every stamped seed", () => {
      expect(parseDeleteCliArgs(["--sweep", "--keep-seed", "none", "--yes"])).toEqual({ mode: "sweep", keepSeedVersion: null, yes: true });
    });

    it("refuses a repeated --keep-seed instead of letting one win", () => {
      expect(parseDeleteCliArgs(["--sweep", "--keep-seed", SEED, "--keep-seed", "2026-10-09.1"]).mode).toBe("error");
    });
  });

  describe("by id", () => {
    it("collects each --id as its own flag, in order, in both spellings", () => {
      expect(parseDeleteCliArgs(["--id", ID_A, "--id", ID_B])).toEqual({ mode: "by-id", ids: [ID_A, ID_B], yes: false });
      expect(parseDeleteCliArgs([`--id=${ID_A}`, "--id", ID_B, "--yes"])).toEqual({ mode: "by-id", ids: [ID_A, ID_B], yes: true });
    });

    it("never treats a following flag as an id, so a left-out id is an error and not a silent --yes delete", () => {
      expect(parseDeleteCliArgs(["--id", "--yes"]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--id"]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--id="]).mode).toBe("error");
    });

    it("refuses --keep-seed together with --id, because it protects nothing there", () => {
      const parsed = parseDeleteCliArgs(["--id", ID_A, "--keep-seed", SEED, "--yes"]);
      expect(parsed.mode).toBe("error");
      expect(parsed).toMatchObject({ message: expect.stringContaining("no effect with --id") });
    });

    it("passes a shortened id through to be refused later, rather than accepting it here", () => {
      // Parsing does not judge the shape; delete-deals-by-id refuses a non-uuid.
      expect(parseDeleteCliArgs(["--id", "73c44fa0"])).toEqual({ mode: "by-id", ids: ["73c44fa0"], yes: false });
    });
  });

  describe("explain", () => {
    it("reads one deal and never deletes, with or without --yes", () => {
      expect(parseDeleteCliArgs(["--explain", ID_A])).toEqual({ mode: "explain", dealId: ID_A, keepSeedVersion: null });
      expect(parseDeleteCliArgs(["--explain", ID_A, "--yes"])).toEqual({ mode: "explain", dealId: ID_A, keepSeedVersion: null });
    });

    it("takes a keep-seed version so the rules it prints match the sweep that would run", () => {
      expect(parseDeleteCliArgs(["--explain", ID_A, "--keep-seed", SEED])).toEqual({ mode: "explain", dealId: ID_A, keepSeedVersion: SEED });
    });

    it("needs a value", () => {
      expect(parseDeleteCliArgs(["--explain", "--yes"]).mode).toBe("error");
      expect(parseDeleteCliArgs(["--explain"]).mode).toBe("error");
    });
  });
});
