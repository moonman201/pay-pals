/**
 * Text helpers shared by the rules: which messages count, and how to quote
 * the sentence that tripped a rule as evidence.
 */
import type { RedFlag, RedFlagCode, RedFlagSeverity } from "@pay-pals/contracts";
import type { RuleInput } from "./types";

export interface Passage {
  /** Where the text came from, for evidence. */
  source: "chat" | "card";
  text: string;
}

/** Seller-written text only: seller chat on the deal channel plus the card's free text. */
export function sellerPassages(input: RuleInput): Passage[] {
  const chat = input.chat
    .filter((m) => m.channel === "deal" && m.author === "seller" && m.text.trim().length > 0)
    .map((m) => ({ source: "chat" as const, text: m.text }));
  const card = [input.card.title, input.card.conditionNotes]
    .filter((t) => t.trim().length > 0)
    .map((text) => ({ source: "card" as const, text }));
  return [...chat, ...card];
}

/** The first passage matching any pattern, with the matching sentence quoted. */
export function findMatch(passages: Passage[], patterns: RegExp[]): { passage: Passage; quote: string } | null {
  for (const passage of passages) {
    for (const pattern of patterns) {
      const match = passage.text.match(pattern);
      if (match) return { passage, quote: sentenceAround(passage.text, match.index ?? 0) };
    }
  }
  return null;
}

/** All distinct sentences across passages that match any pattern. */
export function findAllMatches(passages: Passage[], patterns: RegExp[]): string[] {
  const quotes = new Set<string>();
  for (const passage of passages) {
    for (const pattern of patterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
      const global = new RegExp(pattern.source, flags);
      for (const match of passage.text.matchAll(global)) {
        quotes.add(sentenceAround(passage.text, match.index ?? 0));
      }
    }
  }
  return [...quotes];
}

/** The sentence containing a character offset, trimmed to fit the evidence field. */
export function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(". ", index), text.lastIndexOf("? ", index), text.lastIndexOf("! ", index));
  const from = start === -1 ? 0 : start + 2;
  const ends = [text.indexOf(". ", index), text.indexOf("? ", index), text.indexOf("! ", index)].filter((i) => i !== -1);
  const to = ends.length === 0 ? text.length : Math.min(...ends) + 1;
  return text.slice(from, to).trim().slice(0, 240);
}

export function flag(code: RedFlagCode, severity: RedFlagSeverity, evidence: string, explanation: string): RedFlag {
  return {
    code,
    severity,
    evidence: evidence.slice(0, 500),
    explanation: explanation.slice(0, 300),
    raisedByRule: true,
  };
}

export function quoted(quote: string): string {
  return `Seller wrote: "${quote}"`;
}
