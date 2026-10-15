/**
 * Opt-in token usage log. Off unless PAY_PALS_LOG_USAGE=1. Each model call
 * appends one JSON line of counts to PAY_PALS_USAGE_LOG (default
 * /tmp/pay-pals-usage.jsonl). It never records prompts, answers or ids.
 */
import { appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_USAGE_LOG = "/tmp/pay-pals-usage.jsonl";

export interface UsageLine {
  at: string;
  site: string;
  model: string;
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

type Counted = Pick<Anthropic.Message, "model" | "usage">;

export function usageLine(site: string, message: Counted, now = new Date()): UsageLine {
  const usage: Partial<Anthropic.Usage> = message.usage ?? {};
  return {
    at: now.toISOString(),
    site,
    model: message.model,
    input_tokens: usage.input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  };
}

/**
 * Appends one line when the flag is on and the call went through a real
 * Anthropic client. Fakes in tests report made-up usage, which would pollute
 * the cost numbers. A logging failure never affects a deal.
 */
export function logUsage(site: string, message: Counted, client: unknown): void {
  if (process.env.PAY_PALS_LOG_USAGE !== "1") return;
  if (!(client instanceof Anthropic)) return;
  const file = process.env.PAY_PALS_USAGE_LOG?.trim() || DEFAULT_USAGE_LOG;
  try {
    appendFileSync(file, `${JSON.stringify(usageLine(site, message))}\n`);
  } catch {
    // Diagnostics only.
  }
}
