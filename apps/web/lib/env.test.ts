import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRootEnvLocal, parseEnvFile, type EnvMap } from "./env";

describe("loadRootEnvLocal", () => {
  let root: string;
  let app: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "pay-pals-env-"));
    app = path.join(root, "apps", "web");
    mkdirSync(app, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("applies both the app file and the root file; keys already set win", () => {
    writeFileSync(path.join(app, ".env.local"), 'NEXT_PUBLIC_PAYPAL_CLIENT_ID=public-id\nSHARED=from-app\n');
    writeFileSync(path.join(root, ".env.local"), 'PAYPAL_CLIENT_ID=root-id\nPAYPAL_CLIENT_SECRET="has a \\" quote and spaces"\nSHARED=from-root\nEMPTY_IN_SHELL=filled\n');
    const env: EnvMap = { ALREADY: "shell", EMPTY_IN_SHELL: "" };
    const applied = loadRootEnvLocal(env, app);
    expect(applied).toEqual([path.join(app, ".env.local"), path.join(root, ".env.local")]);
    expect(env.NEXT_PUBLIC_PAYPAL_CLIENT_ID).toBe("public-id");
    expect(env.PAYPAL_CLIENT_ID).toBe("root-id");
    expect(env.PAYPAL_CLIENT_SECRET).toBe('has a \\" quote and spaces');
    expect(env.SHARED).toBe("from-app");
    expect(env.ALREADY).toBe("shell");
    expect(env.EMPTY_IN_SHELL).toBe("filled");
  });

  it("still loads the root file when the app has none, and nothing when neither exists", () => {
    writeFileSync(path.join(root, ".env.local"), "DATABASE_URL=postgres://x\n");
    const env: EnvMap = {};
    expect(loadRootEnvLocal(env, app)).toEqual([path.join(root, ".env.local")]);
    expect(env.DATABASE_URL).toBe("postgres://x");
    const bare = mkdtempSync(path.join(tmpdir(), "pay-pals-bare-"));
    const deep = path.join(bare, "a", "b");
    mkdirSync(deep, { recursive: true });
    expect(loadRootEnvLocal({}, deep)).toEqual([]);
    rmSync(bare, { recursive: true, force: true });
  });

  it("parses comments, export prefixes and quoted values without a shell", () => {
    const parsed = parseEnvFile('# comment\nexport A=1\nB="two words"\nC=\'single\'\nD=a=b\n\nbad line\n');
    expect(parsed).toEqual({ A: "1", B: "two words", C: "single", D: "a=b" });
  });
});
