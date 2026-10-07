/**
 * One Claude call that answers in prose. Used where the output is a
 * paragraph for a person, not structured data. Returns null on any failure
 * so callers fall back to their deterministic text.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "./client";
import { modelId } from "./client";

export async function callText(client: ClaudeClient, system: string, prompt: string, maxTokens = 2048): Promise<string | null> {
  try {
    const message = await client.messages.create({
      model: modelId(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (message.stop_reason === "refusal") return null;
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    const reason = error instanceof Anthropic.APIError ? `Claude API error ${error.status ?? ""}: ${error.message}` : String(error);
    console.warn(`[pay-pals agents] ${reason}`);
    return null;
  }
}
