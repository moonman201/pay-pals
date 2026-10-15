import { describe, expect, it } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { fakeClaude } from "../testing/fake-claude";
import { cachedSystem, cachedTools } from "./cache";
import { callText } from "./text-call";
import { callTool } from "./tool-call";

const TOOL: Anthropic.Tool = { name: "answer", description: "Answer.", input_schema: { type: "object", properties: {} } };
const OTHER: Anthropic.Tool = { ...TOOL, name: "other" };

describe("prompt caching", () => {
  it("marks only the last tool", () => {
    const tools = cachedTools([TOOL, OTHER]);
    expect(tools[0]).not.toHaveProperty("cache_control");
    expect(tools[1]).toHaveProperty("cache_control", { type: "ephemeral" });
  });

  it("caches the stable system block and leaves the tail uncached", () => {
    const blocks = cachedSystem("stable", "tail");
    expect(blocks[0]).toMatchObject({ text: "stable", cache_control: { type: "ephemeral" } });
    expect(blocks[1]).toEqual({ type: "text", text: "tail" });
    expect(cachedSystem("stable")).toHaveLength(1);
  });

  it("callTool sends a cached system block and a cached tool, with the data in the user message", async () => {
    const client = fakeClaude(() => ({}));
    await callTool({ client, system: "rules", content: [{ type: "text", text: "the card" }], tool: TOOL, schema: z.object({}) });
    const params = client.calls[0]!;
    expect(params.system).toEqual([{ type: "text", text: "rules", cache_control: { type: "ephemeral" } }]);
    expect(params.tools?.at(-1)).toHaveProperty("cache_control", { type: "ephemeral" });
    expect(JSON.stringify(params.messages)).toContain("the card");
  });

  it("two calls with different data send a byte-identical prefix", async () => {
    const client = fakeClaude(() => ({}));
    const ask = (text: string) => callTool({ client, system: "rules", content: [{ type: "text", text }], tool: TOOL, schema: z.object({}) });
    await ask("first card");
    await ask("second card");
    const prefix = (p: Anthropic.MessageCreateParamsNonStreaming) => JSON.stringify([p.tools, p.system]);
    expect(prefix(client.calls[0]!)).toBe(prefix(client.calls[1]!));
  });

  it("callText caches the stable block and sends the tail after it", async () => {
    const client = fakeClaude(() => null);
    await callText(client, "rules", "prompt", 100, "case line");
    expect(client.calls[0]!.system).toEqual([
      { type: "text", text: "rules", cache_control: { type: "ephemeral" } },
      { type: "text", text: "case line" },
    ]);
  });
});
