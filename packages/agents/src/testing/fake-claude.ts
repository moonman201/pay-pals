/**
 * A fake Anthropic client for tests. The responder gets the request params
 * and returns the tool input the model "chose", or null to answer in prose
 * without calling the tool. Every call is recorded for assertions.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "../claude/client";

export type FakeResponder = (params: Anthropic.MessageCreateParamsNonStreaming) => unknown;

/**
 * The name of the tool a request offered, or null.
 *
 * `params.tools` is `ToolUnion[]`, which includes the SDK's server-side tools,
 * and not all of those carry a `name`. Reading `.name` off the union directly
 * does not typecheck, and because test files were excluded from `typecheck`
 * until now, 22 call sites did it anyway. This is the one place that narrows
 * it, so the tests say what they mean and the compiler agrees.
 */
export function toolName(params: Anthropic.MessageCreateParamsNonStreaming, index = 0): string | null {
  const tool = params.tools?.[index];
  return tool && "name" in tool ? tool.name : null;
}

/** True when the request offered this tool first. The common assertion in the pal tests. */
export function offersTool(params: Anthropic.MessageCreateParamsNonStreaming, name: string): boolean {
  return toolName(params) === name;
}

export interface FakeClaude extends ClaudeClient {
  calls: Anthropic.MessageCreateParamsNonStreaming[];
}

export function fakeClaude(respond: FakeResponder): FakeClaude {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        const input = respond(params);
        const name = toolName(params) ?? "tool";
        const content =
          input === null || input === undefined
            ? [{ type: "text", text: "I have nothing to add." }]
            : [{ type: "tool_use", id: "toolu_fake", name, input }];
        return {
          id: "msg_fake",
          type: "message",
          role: "assistant",
          model: params.model,
          content,
          stop_reason: input === null || input === undefined ? "end_turn" : "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}

/** Text the fake was shown, joined, so tests can check what the model saw. */
export function promptText(params: Anthropic.MessageCreateParamsNonStreaming): string {
  const parts: string[] = [];
  if (typeof params.system === "string") parts.push(params.system);
  for (const message of params.messages) {
    if (typeof message.content === "string") parts.push(message.content);
    else for (const block of message.content) if (block.type === "text") parts.push(block.text);
  }
  return parts.join("\n");
}
