import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectUploadsEnabled } from "./uploads";

describe("detectUploadsEnabled", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) {
      try {
        chmodSync(path.join(d, "public"), 0o755);
      } catch {}
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("is true where public/uploads can be created and written", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "pay-pals-up-"));
    dirs.push(cwd);
    expect(detectUploadsEnabled(cwd)).toBe(true);
  });

  it("is false where the folder cannot be created (a read-only host)", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "pay-pals-ro-"));
    dirs.push(cwd);
    mkdirSync(path.join(cwd, "public"));
    chmodSync(path.join(cwd, "public"), 0o555);
    const result = detectUploadsEnabled(cwd);
    // Root can write anywhere; only assert when the permission bit took effect.
    if (process.getuid && process.getuid() !== 0) expect(result).toBe(false);
  });
});
