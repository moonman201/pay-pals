/**
 * A Claude client that answers one photo read with a reading we choose.
 *
 * The near-miss band only applies when at least one side of a serial
 * comparison came from an OCR read, so a test of it has to produce a reading
 * whose source is vision, not a caption. That needs a model, and a real one
 * would make the case non-deterministic in exactly the dimension under test:
 * the point is what the comparison does with a given pair of numbers, not
 * what the model reads off a picture today.
 *
 * packages/agents has its own fake for this (`src/testing/fake-claude.ts`),
 * but it is not on the package's published surface, and reaching past
 * `@pay-pals/agents` for it would break the rule that modules talk through
 * their interfaces. So this is a local one, built against `ClaudeClient`,
 * which is published.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "@pay-pals/agents";

export interface PhotoReading {
  brand: string | null;
  model: string | null;
  serial: string | null;
  serial_on: "item" | "packaging" | null;
  item_present: boolean | null;
}

/**
 * Answers every `report_photo_reading` call with `reading`, as a tool use, so
 * the pal records it with source "vision". Any other tool gets no answer,
 * which the pals already handle as "the model said nothing".
 */
export function fakeVision(reading: PhotoReading): ClaudeClient {
  return {
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
        const first = params.tools?.[0];
        const tool = first && "name" in first ? first.name : "";
        const answered = tool === "report_photo_reading";
        return {
          id: "msg_fake_vision",
          type: "message",
          role: "assistant",
          model: params.model,
          content: answered ? [{ type: "tool_use", id: "toolu_fake", name: tool, input: reading }] : [{ type: "text", text: "No answer." }],
          stop_reason: answered ? "tool_use" : "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        } as unknown as Anthropic.Message;
      },
    },
  };
}
