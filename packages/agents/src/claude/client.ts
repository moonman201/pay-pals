/**
 * The slice of the Anthropic client the pals use. Tests pass a fake that
 * satisfies this shape; production passes a real `new Anthropic()`.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface ClaudeClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ): Promise<Anthropic.Message>;
  };
}

export const DEFAULT_MODEL = "claude-sonnet-5";

/** Model id from the environment, falling back to the default. */
export function modelId(): string {
  const fromEnv = process.env.ANTHROPIC_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MODEL;
}

/** A real client when ANTHROPIC_API_KEY is set, otherwise null so callers run rules only. */
export function createAnthropicClientFromEnv(): ClaudeClient | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}
