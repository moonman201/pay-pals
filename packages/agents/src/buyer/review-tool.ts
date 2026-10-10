/**
 * The one tool the Buyer Pal's model call answers with. The schema spells out
 * what the model may do: add flags, raise a severity, reword an explanation,
 * ask the seller questions, add to the pal's reasons, write the pal message.
 * Nothing here lets it drop or soften a rule's flag, or take back one of the
 * pal's reasons; merge-flags.ts and reasoning.ts enforce that on the way back.
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
  reasoning: z
    .object({
      checked: z.array(clip(300)).default([]),
      found: z.array(clip(300)).default([]),
      could_not_verify: z.array(clip(300)).default([]),
      would_change_my_mind: z.array(clip(300)).default([]),
    })
    .default({}),
});
export type ModelReview = z.infer<typeof ModelReviewSchema>;

export const REVIEW_TOOL: Anthropic.Tool = {
  name: "submit_review",
  description:
    "Submit the Buyer Pal's review. The rule flags are fixed facts and stay in the verdict as given, and so are the reasons already worked out. You may add flags the rules missed, raise a rule flag's severity, reword a rule flag's explanation in plainer words, list questions for the seller, add to the pal's reasons and write the message to the buyer.",
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
      reasoning: {
        type: "object",
        description:
          "What you can add to the pal's reasons that the rules and the lookups have not already said. The four groups are shown to the buyer and to the seller as the pal's working. Leave a group empty rather than padding it; the lines already there are kept whatever you send.",
        properties: {
          checked: {
            type: "array",
            items: { type: "string" },
            description:
              "Something you looked at, and what you compared it against, such as the seller's answer about the charger against what the card lists as included. Name no check that did not happen.",
          },
          found: { type: "array", items: { type: "string" }, description: "Something you noticed when you looked. One short plain sentence each." },
          could_not_verify: {
            type: "array",
            items: { type: "string" },
            description:
              "Something you could not establish, and why not. This is the group that matters most and the one you will be tempted to leave thin. A question the seller has not answered, a claim resting only on the seller's word, a caption you had no way to check: each of those belongs here.",
          },
          would_change_my_mind: {
            type: "array",
            items: { type: "string" },
            description:
              "The photo, the document or the answer that would move this verdict, written so the other side can act on it. It must agree with questions_for_seller: never say something would not help when you have asked for it there.",
          },
        },
        required: ["checked", "found", "could_not_verify", "would_change_my_mind"],
        additionalProperties: false,
      },
    },
    required: ["additional_flags", "severity_raises", "explanations", "questions_for_seller", "pal_message", "reasoning"],
    additionalProperties: false,
  },
};
