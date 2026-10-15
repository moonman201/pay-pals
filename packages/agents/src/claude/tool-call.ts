/**
 * One Claude call that must answer by calling one tool. The tool input is
 * validated with Zod so a malformed answer degrades to "no answer" instead of
 * crashing a deal. Every pal uses this; none of them loop.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType, ZodTypeDef } from "zod";
import type { ClaudeClient } from "./client";
import { cachedSystem, cachedTools } from "./cache";
import { modelId } from "./client";

export interface ToolCallRequest<T> {
  client: ClaudeClient;
  /** Stable instructions only. Cached, so nothing per-request belongs here. */
  system: string;
  /** Instructions that vary a little between calls. Sent after the cached block so they never break it. */
  systemTail?: string;
  content: Anthropic.ContentBlockParam[];
  tool: Anthropic.Tool;
  /** Output type T; the input side is unknown because defaults and transforms apply on the way in. */
  schema: ZodType<T, ZodTypeDef, unknown>;
  maxTokens?: number;
}

export interface ToolCallResult<T> {
  value: T | null;
  /** Why value is null: the model skipped the tool, sent a bad shape, or the API failed. */
  reason?: string;
}

export async function callTool<T>(request: ToolCallRequest<T>): Promise<ToolCallResult<T>> {
  let message: Anthropic.Message;
  try {
    message = await request.client.messages.create({
      model: modelId(),
      max_tokens: request.maxTokens ?? 8000,
      system: cachedSystem(request.system, request.systemTail),
      tools: cachedTools([request.tool]),
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages: [
        {
          role: "user",
          content: [
            ...request.content,
            {
              type: "text",
              text: `Answer by calling the ${request.tool.name} tool exactly once. Do not answer in prose.`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    const reason =
      error instanceof Anthropic.APIError
        ? `Claude API error ${error.status ?? ""}: ${error.message}`
        : `Claude call failed: ${error instanceof Error ? error.message : String(error)}`;
    console.warn(`[pay-pals agents] ${reason}`);
    return { value: null, reason };
  }

  if (message.stop_reason === "refusal") return { value: null, reason: "Claude declined the request." };

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === request.tool.name,
  );
  if (!toolUse) return { value: null, reason: "Claude did not call the tool." };

  const parsed = request.schema.safeParse(toolUse.input);
  if (!parsed.success) return { value: null, reason: `Tool input failed validation: ${parsed.error.message}` };
  return { value: parsed.data };
}
