/**
 * Prompt caching helpers. A cache hit is a prefix match in the order tools,
 * system, messages, so the stable instructions go in `system` with a
 * breakpoint on the last block, and the tool list gets one on its last tool.
 * Anything per-request (card, chat, photos, dates) belongs in the user message.
 */
import type Anthropic from "@anthropic-ai/sdk";

const EPHEMERAL = { type: "ephemeral" } as const;

/** The stable system text as a cached block, plus an optional uncached tail for text that varies. */
export function cachedSystem(stable: string, tail?: string): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: stable, cache_control: EPHEMERAL }];
  if (tail) blocks.push({ type: "text", text: tail });
  return blocks;
}

/** The tool list with a cache breakpoint on the last tool. The order given is the order sent. */
export function cachedTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools.map((tool, index) => (index === tools.length - 1 ? { ...tool, cache_control: EPHEMERAL } : tool));
}
