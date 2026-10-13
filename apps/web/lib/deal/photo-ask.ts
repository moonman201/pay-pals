/**
 * What the seller is being asked to photograph, and which demo photo answers it.
 *
 * Nothing here knows a scenario. The asks come from what the deal already
 * holds: the Buyer Pal's open questions before payment, the Seller Pal's own
 * packing checklist after it. A demo photo is offered only when its
 * description shares enough words with the ask. When none does, the seller is
 * sent to take the photo themselves, which is the honest answer for a scenario
 * that ships no photo for that ask.
 */
import type { ChecklistItem, Photo } from "@pay-pals/contracts";

/** Words that say a question is about a picture and not, say, a price. */
const PHOTO_ASK = /\b(photos?|pictures?|photograph(?:s|ed)?|close-?ups?|shots?|images?)\b|\bnote with\b|\bdated note\b|\bnext to\b/i;

const STOP = new Set(["the", "and", "that", "this", "with", "your", "you", "can", "will", "for", "from", "have", "into", "onto", "just", "also", "each", "when", "what", "where", "which", "does", "did", "was", "were", "are", "its", "one", "any", "same", "yet", "there", "than", "then", "them", "they", "their"]);

/** Words that mean the same thing in an ask and in a photo's description. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  sealed: ["taped", "shut", "closed"],
  taped: ["sealed", "shut"],
  closeup: ["close"],
};

function words(text: string, expand = true): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/close-?up/g, "close up").split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    out.add(raw);
    if (expand) for (const alias of ALIASES[raw] ?? []) out.add(alias);
  }
  return out;
}

/** How many distinctive words the ask and the photo share. Two is the least that counts as a match. */
const LEAST_SHARED = 2;

function bestPhoto(ask: string, photos: readonly Photo[]): Photo | null {
  const wanted = words(ask);
  let best: { photo: Photo; shared: number } | null = null;
  for (const photo of photos) {
    const shared = [...words(photo.whatItShows)].filter((w) => wanted.has(w)).length;
    if (shared >= LEAST_SHARED && (best === null || shared > best.shared)) best = { photo, shared };
  }
  return best?.photo ?? null;
}

export interface PhotoAsk {
  /** The question as the Buyer Pal put it. */
  ask: string;
  /** A demo photo that answers it, or null when the seller has to take one. */
  photo: Photo | null;
}

/** The first open question that asks for a picture, with the demo photo that answers it if one does. */
export function photoAsk(questions: readonly string[], demoPhotos: readonly Photo[]): PhotoAsk | null {
  const ask = questions.find((q) => PHOTO_ASK.test(q));
  return ask ? { ask, photo: bestPhoto(ask, demoPhotos) } : null;
}

export interface PackingAsk {
  item: ChecklistItem;
  photo: Photo | null;
}

/** The checklist steps that ask for a photo, each with the demo packing photo that answers it if one does. */
export function packingAsks(checklist: readonly ChecklistItem[], demoPhotos: readonly Photo[]): PackingAsk[] {
  return checklist.filter((c) => c.required && /\bphoto\b/i.test(c.label)).map((item) => ({ item, photo: photoShowing(item.label, demoPhotos) }));
}

/**
 * A packing step is a specific thing: "the console going into the box" is not "a sealed box". A
 * demo photo is offered only when its caption names every object the step is about, so a photo of
 * a taped box can never stand in for the step that asks for what went inside it.
 */
function photoShowing(label: string, photos: readonly Photo[]): Photo | null {
  const subject = label.replace(/^photo of\s+(the\s+)?/i, "").split(/\b(?:going|into|inside|in the)\b/i)[0] ?? "";
  const needed = [...words(subject, false)].filter((w) => w !== "photo");
  if (needed.length === 0) return null;
  const alternatives = (w: string) => [w, ...(ALIASES[w] ?? [])];
  return (
    photos.find((p) => {
      const caption = words(p.whatItShows);
      return needed.every((w) => alternatives(w).some((a) => caption.has(a)));
    }) ?? null
  );
}
