import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicMode, PHOTO_PROBE_DIR, publicModeLine } from "./public-mode";

function publicDir(withPhoto: boolean): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pay-pals-public-"));
  mkdirSync(path.join(dir, PHOTO_PROBE_DIR), { recursive: true });
  if (withPhoto) writeFileSync(path.join(dir, PHOTO_PROBE_DIR, "console.jpg"), "x");
  return dir;
}

describe("isPublicMode", () => {
  it("is on when PAY_PALS_PUBLIC_MODE is 1 or true, whatever the host", () => {
    expect(isPublicMode({ PAY_PALS_PUBLIC_MODE: "1" }, publicDir(true))).toBe(true);
    expect(isPublicMode({ PAY_PALS_PUBLIC_MODE: "true" }, publicDir(true))).toBe(true);
    expect(isPublicMode({ PAY_PALS_PUBLIC_MODE: "0" }, publicDir(true))).toBe(false);
  });

  it("is on for a Vercel host with no demo photos, off once the photos land", () => {
    expect(isPublicMode({ VERCEL: "1" }, publicDir(false))).toBe(true);
    expect(isPublicMode({ VERCEL: "1" }, path.join(os.tmpdir(), "pay-pals-no-such-dir"))).toBe(true);
    expect(isPublicMode({ VERCEL: "1" }, publicDir(true))).toBe(false);
  });

  it("is off with nothing set, as in tests and local dev", () => {
    expect(isPublicMode({}, publicDir(false))).toBe(false);
  });

  it("logs one line that names the reason and no value", () => {
    expect(publicModeLine(false, {})).toContain("public mode: off");
    expect(publicModeLine(true, { PAY_PALS_PUBLIC_MODE: "1" })).toContain("(PAY_PALS_PUBLIC_MODE)");
    expect(publicModeLine(true, { VERCEL: "1" })).toContain("Vercel with no demo photos");
  });
});
