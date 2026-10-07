/**
 * lib/services.ts is the only production file allowed to import from
 * lib/mocks. Everything else talks to the contract interfaces, so swapping
 * in the real packages touches one file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["app", "components", "lib"];
const ALLOWED = new Set(["lib/services.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("mock imports", () => {
  it("only lib/services.ts imports from lib/mocks", () => {
    const offenders: string[] = [];
    for (const dir of SCAN) {
      for (const file of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (rel.startsWith("lib/mocks/") || /\.test\.tsx?$/.test(rel) || ALLOWED.has(rel)) continue;
        const source = readFileSync(file, "utf8");
        if (/from\s+["'][^"']*\/mocks(\/|["'])/.test(source) || /from\s+["']@\/lib\/mocks/.test(source)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
