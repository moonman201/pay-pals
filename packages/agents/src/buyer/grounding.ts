/**
 * Decides whether a model-added flag's evidence is real: it must point at
 * something that exists in the shared chat or on the card, and it must not
 * be copied out of the prompt we sent. Rejected first, then two ways to
 * qualify, all deterministic:
 *   - rejected: anything carrying prompt scaffolding (the photo block, a
 *     section label, a JSON field name with a colon, an image filename),
 *     because that is our own text, not the deal's;
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

/** Phrases that only ever appear in the prompt the pal sends, never in a deal. */
const SCAFFOLDING: readonly RegExp[] = [
  /\bphoto block\b/,
  /\bphotos on the card\b/,
  /\bseller.?s caption\b/,
  /\bnot looked at\b/,
  /\bcould not be loaded\b/,
  /\bread by the vision model\b/,
  /\bvision model\b/,
  /\bfixed fact/,
  /\bitem card \(version/,
  /\bshared chat, in order\b/,
  /\bcert check \(/,
  /\bmarket range \$/,
  /\.(?:jpg|jpeg|png|gif|webp)\b/,
];

/** A JSON or prompt field name followed by a colon, as in the card we serialize into the prompt. */
const FIELD_COLON =
  /(?:^|[\s;,(\[])(?:dealid|version|title|brand|model|serial|boxserial|certnumber|grade|conditiongrade|conditionnotes|included|photos|whatitshows|addedby|addedat|askingprice|currency|sellerpaypalemail|lockedat|code|severity|evidence|explanation|raisedbyrule|marketlow|markethigh|provider|sources|checkedat)\s*:/;

function fold(text: string): string {
  return text.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/\s+/g, " ").trim();
}

/** True when the evidence quotes our prompt rather than the chat or the card. */
export function quotesPromptScaffolding(evidence: string): boolean {
  const folded = fold(evidence);
  return SCAFFOLDING.some((pattern) => pattern.test(folded)) || FIELD_COLON.test(folded);
}

function words(text: string): string[] {
  return fold(text)
    .split(" ")
    .map((w) => w.replace(/^[^a-z0-9@]+|[^a-z0-9@]+$/g, ""))
    .filter((w) => w.length > 0);
}

/** The card's text a quote can be grounded in. Photo urls are left out: a filename is never evidence. */
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
    ...card.photos.map((p) => p.whatItShows),
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
  if (quotesPromptScaffolding(folded)) return false;

  if (corpus.values.some((value) => folded.includes(value))) return true;
  if (corpus.numbers.some((n) => folded.replace(/\s+/g, "").includes(n.name) && folded.includes(n.value))) return true;

  const tokens = words(evidence);
  for (let start = 0; start + MIN_RUN_WORDS <= tokens.length; start += 1) {
    const run = tokens.slice(start, start + MIN_RUN_WORDS).join(" ");
    if (run.length >= MIN_RUN_CHARS && corpus.text.includes(` ${run} `)) return true;
  }
  return false;
}
