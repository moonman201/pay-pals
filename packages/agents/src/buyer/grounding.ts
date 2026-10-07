/**
 * Decides whether a model-added flag's evidence is real: it must point at
 * something that exists in the shared chat or on the card. Two ways to
 * qualify, both deterministic:
 *   - a run of three or more consecutive words (twelve or more characters,
 *     case, whitespace and edge punctuation folded) also found in the chat
 *     or in the card's text values, or
 *   - a card value of six or more characters (serial, email, model, a photo
 *     description) or a numeric field named together with its value.
 * Anything else, for example the model's own unanswered questions, is not
 * evidence and the flag is dropped.
 */
import type { ItemCard, Message } from "@pay-pals/contracts";

export interface GroundingCorpus {
  /** Folded free text: chat lines and the card's string values. */
  text: string;
  /** Card string values of six or more characters, folded. */
  values: string[];
  /** Numeric card fields as "name" and "value" pairs. */
  numbers: Array<{ name: string; value: string }>;
}

const MIN_RUN_WORDS = 3;
const MIN_RUN_CHARS = 12;
const MIN_VALUE_CHARS = 6;

function fold(text: string): string {
  return text.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return fold(text)
    .split(" ")
    .map((w) => w.replace(/^[^a-z0-9@]+|[^a-z0-9@]+$/g, ""))
    .filter((w) => w.length > 0);
}

function cardStrings(card: ItemCard): string[] {
  return [
    card.title,
    card.brand,
    card.model,
    card.serial ?? "",
    card.boxSerial ?? "",
    card.certNumber ?? "",
    card.grade ?? "",
    card.conditionGrade,
    card.conditionNotes,
    card.sellerPaypalEmail,
    ...card.included,
    ...card.photos.flatMap((p) => [p.whatItShows, p.url]),
  ].filter((s) => s.length > 0);
}

export function buildGroundingCorpus(card: ItemCard | null, chat: Message[]): GroundingCorpus {
  const chatLines = chat.filter((m) => m.channel === "deal").flatMap((m) => [m.text, ...m.photos.map((p) => p.whatItShows)]);
  const strings = card ? cardStrings(card) : [];
  return {
    text: " " + words([...chatLines, ...strings].join(" \n ")).join(" ") + " ",
    values: strings.map(fold).filter((s) => s.length >= MIN_VALUE_CHARS),
    numbers: card
      ? [
          { name: "askingprice", value: String(card.askingPrice) },
          { name: "version", value: String(card.version) },
        ]
      : [],
  };
}

export function isGrounded(evidence: string, corpus: GroundingCorpus): boolean {
  const folded = fold(evidence);
  if (folded.length === 0) return false;

  if (corpus.values.some((value) => folded.includes(value))) return true;
  if (corpus.numbers.some((n) => folded.replace(/\s+/g, "").includes(n.name) && folded.includes(n.value))) return true;

  const tokens = words(evidence);
  for (let start = 0; start + MIN_RUN_WORDS <= tokens.length; start += 1) {
    const run = tokens.slice(start, start + MIN_RUN_WORDS).join(" ");
    if (run.length >= MIN_RUN_CHARS && corpus.text.includes(` ${run} `)) return true;
  }
  return false;
}
