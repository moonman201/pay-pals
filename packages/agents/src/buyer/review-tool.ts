/**
 * The one tool the Buyer Pal's model call answers with. The schema spells out
 * what the model may do: add flags, raise a severity, reword an explanation,
 * ask the seller questions, write the pal message. Nothing here lets it drop
 * or soften a rule's flag; merge-flags.ts enforces that on the way back.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { RED_FLAG_CODES, RED_FLAG_SEVERITIES } from "@pay-pals/contracts";
import { z } from "zod";
import { plainCopy } from "../copy";

/** House style and a cut at the last full sentence, never mid-word. */
const clip = (max: number) => z.string().transform((s) => plainCopy(s, max));

export const ModelReviewSchema = z.object({
  additional_flags: z
    .array(
      z.object({
        code: z.enum(RED_FLAG_CODES),
        severity: z.enum(RED_FLAG_SEVERITIES),
        evidence: clip(500),
        explanation: clip(300),
      }),
    )
    .default([]),
  severity_raises: z.array(z.object({ code: z.enum(RED_FLAG_CODES), severity: z.enum(RED_FLAG_SEVERITIES) })).default([]),
  explanations: z.array(z.object({ code: z.enum(RED_FLAG_CODES), explanation: clip(300) })).default([]),
  questions_for_seller: z.array(clip(300)).default([]),
  pal_message: clip(800),
});
export type ModelReview = z.infer<typeof ModelReviewSchema>;

export const REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_review",
  description:
    "Submit the Buyer Pal's review. The rule flags are fixed facts and stay in the verdict as given. You may add flags the rules missed, raise a rule flag's severity, reword a rule flag's explanation in plainer words, list questions for the seller and write the message to the buyer.",
  input_schema: {
    type: "object",
    properties: {
      additional_flags: {
        type: "array",
        description: "Flags the rules did not raise. Evidence must be a quote from the chat or a card field with its value; a flag without such evidence is discarded. A missing answer is a question, not a flag.",
        items: {
          type: "object",
          properties: {
            code: { type: "string", enum: [...RED_FLAG_CODES] },
            severity: { type: "string", enum: [...RED_FLAG_SEVERITIES] },
            evidence: { type: "string", description: "A quote from the chat or the field name and value." },
            explanation: { type: "string", description: "One plain sentence for the buyer." },
          },
          required: ["code", "severity", "evidence", "explanation"],
          additionalProperties: false,
        },
      },
      severity_raises: {
        type: "array",
        description: "Rule flags that deserve a higher severity. Lower severities are ignored. Only payment-method and price codes can become stop; other raises are capped at caution.",
        items: {
          type: "object",
          properties: {
            code: { type: "string", enum: [...RED_FLAG_CODES] },
            severity: { type: "string", enum: [...RED_FLAG_SEVERITIES] },
          },
          required: ["code", "severity"],
          additionalProperties: false,
        },
      },
      explanations: {
        type: "array",
        description: "Plainer one-sentence explanations for rule flags, by code.",
        items: {
          type: "object",
          properties: {
            code: { type: "string", enum: [...RED_FLAG_CODES] },
            explanation: { type: "string" },
          },
          required: ["code", "explanation"],
          additionalProperties: false,
        },
      },
      questions_for_seller: {
        type: "array",
        description: "Up to three specific things the buyer should get from the seller before paying, things they can act on first (a photo of a part, the serial, a receipt). Empty when the deal is a stop or when nothing is missing.",
        items: { type: "string" },
      },
      pal_message: {
        type: "string",
        description: "Two to four short sentences to the buyer. Plain words. No em dashes, no exclamation marks, no hype.",
      },
    },
    required: ["additional_flags", "severity_raises", "explanations", "questions_for_seller", "pal_message"],
    additionalProperties: false,
  },
};
