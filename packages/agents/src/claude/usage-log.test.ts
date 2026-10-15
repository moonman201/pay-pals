import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { fakeClaude } from "../testing/fake-claude";
import { callText } from "./text-call";
import { callTool } from "./tool-call";
import { logUsage, usageLine } from "./usage-log";
import { costOf, formatSummary, parseLines, totalsBySite } from "./usage-summary";

const TOOL: Anthropic.Tool = { name: "answer", description: "Answer.", input_schema: { type: "object", properties: {} } };
const message = { model: "claude-sonnet-5", usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 40 } } as Anthropic.Message;

function tempLog(): string {
  return join(mkdtempSync(join(tmpdir(), "usage-")), "log.jsonl");
}

// The outer environment may have the flag set (cost measurement does), so each test starts clean and restores it.
const outer = { flag: process.env.PAY_PALS_LOG_USAGE, file: process.env.PAY_PALS_USAGE_LOG };
function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
beforeEach(() => {
  delete process.env.PAY_PALS_LOG_USAGE;
  delete process.env.PAY_PALS_USAGE_LOG;
});
afterEach(() => {
  restore("PAY_PALS_LOG_USAGE", outer.flag);
  restore("PAY_PALS_USAGE_LOG", outer.file);
});

describe("usage log", () => {
  it("writes nothing when the flag is off", () => {
    const file = tempLog();
    process.env.PAY_PALS_USAGE_LOG = file;
    logUsage("test", message);
    expect(existsSync(file)).toBe(false);
  });

  it("appends one line of counts when the flag is on", () => {
    const file = tempLog();
    process.env.PAY_PALS_LOG_USAGE = "1";
    process.env.PAY_PALS_USAGE_LOG = file;
    logUsage("test", message);
    logUsage("test", message);
    const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ site: "test", model: "claude-sonnet-5", input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 40 });
    expect(Object.keys(lines[0]).sort()).toEqual(["at", "cache_creation_input_tokens", "cache_read_input_tokens", "input_tokens", "model", "output_tokens", "site"]);
  });

  it("callTool and callText log under their site, without content", async () => {
    const file = tempLog();
    process.env.PAY_PALS_LOG_USAGE = "1";
    process.env.PAY_PALS_USAGE_LOG = file;
    const client = fakeClaude(() => ({}));
    await callTool({ client, site: "site.a", system: "s", content: [{ type: "text", text: "SECRET-CARD-TEXT" }], tool: TOOL, schema: z.object({}) });
    await callText(client, "site.b", "s", "SECRET-PROMPT");
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain("SECRET");
    expect(parseLines(raw).map((l) => l.site)).toEqual(["site.a", "site.b"]);
  });

  it("fills zeros when usage fields are missing", () => {
    expect(usageLine("x", { model: "m", usage: { input_tokens: 5 } } as Anthropic.Message)).toMatchObject({ cache_read_input_tokens: 0, output_tokens: 0 });
  });
});

describe("usage summary", () => {
  it("prices at Sonnet 5 rates", () => {
    expect(costOf({ input: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000, output: 1_000_000 })).toBeCloseTo(14.7);
  });

  it("totals by site and skips torn lines", () => {
    const text = [
      JSON.stringify({ site: "a", input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 10 }),
      "{not json",
      JSON.stringify({ site: "a", input_tokens: 50, cache_creation_input_tokens: 500, cache_read_input_tokens: 0, output_tokens: 5 }),
      JSON.stringify({ site: "b", input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }),
    ].join("\n");
    const totals = totalsBySite(parseLines(text));
    expect(totals.get("a")).toMatchObject({ calls: 2, input: 150, cacheWrite: 500, cacheRead: 1000, output: 15 });
    expect(formatSummary(totals)).toContain("TOTAL");
  });
});
