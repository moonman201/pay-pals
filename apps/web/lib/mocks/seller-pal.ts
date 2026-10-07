/**
 * Fixture-backed SellerPal. A pasted demo listing returns that scenario's
 * card. Anything else gets a plain card read from the text: title, price,
 * serial if one is written down, and a condition grade from the words used.
 */
import type { BuildCardInput, BuyerRequest, ChecklistItem, ConditionGrade, Deal, ItemCard, PalResult, Photo, SellerPal } from "@pay-pals/contracts";
import { fixtureById, fixtureForCard, fixtureForListing, nextFixtureCard, readSerial } from "./fixture-match";

function gradeFromText(text: string): ConditionGrade {
  const t = text.toLowerCase();
  if (/for parts|not working|broken/.test(t)) return "for_parts";
  if (/brand new|sealed|unopened/.test(t)) return "new";
  if (/like new|barely (worn|used)|mint/.test(t)) return "like_new";
  if (/fair|heavy wear|scratched/.test(t)) return "fair";
  return "good";
}

function includedFromText(text: string): string[] {
  const t = text.toLowerCase();
  const items = ["Item as described"];
  if (/\bbox\b/.test(t)) items.push("Original box");
  if (/charger|charging cable|cable/.test(t)) items.push("Charging cable");
  return items;
}

function genericCard(input: BuildCardInput): ItemCard {
  const text = input.listingText.trim();
  const firstSentence = text.split(/[.\n]/)[0]?.trim() || "Item for sale";
  const title = firstSentence.slice(0, 120);
  const price = /\$\s?(\d+(?:\.\d{1,2})?)/.exec(text);
  const photoText = input.photos.map((p) => p.whatItShows).join(" ");
  return {
    dealId: input.dealId,
    version: 1,
    title,
    brand: title.split(/\s+/)[0] ?? "Unknown",
    model: title.slice(0, 80),
    serial: readSerial(photoText) ?? readSerial(text) ?? readSerial(input.sellerNotes),
    conditionGrade: gradeFromText(text),
    conditionNotes: text.slice(0, 600),
    included: includedFromText(text + " " + input.sellerNotes),
    photos: input.photos,
    askingPrice: price ? Number(price[1]) : 1,
    currency: "USD",
    sellerPaypalEmail: input.sellerPaypalEmail,
    lockedAt: null,
  };
}

function appendPhotos(existing: Photo[], added: Photo[]): Photo[] {
  const have = new Set(existing.map((p) => p.url));
  return [...existing, ...added.filter((p) => !have.has(p.url))];
}

const GENERIC_CHECKLIST: ChecklistItem[] = [
  { id: "c1", label: "Photo of the item going into the shipping box", required: true, done: false },
  { id: "c2", label: "Photo of the sealed box with the label on it", required: true, done: false },
  { id: "c3", label: "Enter the carrier and tracking number", required: true, done: false },
  { id: "c4", label: "Ship to the address on the PayPal order only", required: true, done: false },
];

export function createMockSellerPal(): SellerPal {
  return {
    async buildCard(input: BuildCardInput): Promise<PalResult<ItemCard>> {
      const fixture = fixtureForListing(input.listingText);
      const base = fixture?.cards[0];
      if (fixture && base) {
        const card: ItemCard = {
          ...base,
          dealId: input.dealId,
          sellerPaypalEmail: input.sellerPaypalEmail || base.sellerPaypalEmail,
          photos: input.photos.length > 0 ? input.photos : base.photos,
          lockedAt: null,
        };
        const serialNote = card.serial ? `Serial ${card.serial} read from the caseback photo.` : "I could not find a serial number in the photos. Buyers will ask for one.";
        return { data: card, palMessage: `I built card version 1 from your listing. ${serialNote} Check it and fix anything I got wrong.` };
      }
      const card = genericCard(input);
      const serialNote = card.serial ? `Serial ${card.serial} noted.` : "No serial number found. Add a photo of it if you can.";
      return { data: card, palMessage: `I built card version 1 from your listing. ${serialNote} Check the price and condition before you share the link.` };
    },

    async applyRequest(card: ItemCard, buyerRequest: BuyerRequest, sellerReply: string, newPhotos: Photo[] = []): Promise<PalResult<ItemCard>> {
      if (card.lockedAt !== null) throw new Error("The card is locked. Start a new deal to change it.");
      const fixture = fixtureForCard(card);
      const next = fixture ? nextFixtureCard(fixture, card) : null;
      if (next) {
        const data: ItemCard = { ...next, dealId: card.dealId, sellerPaypalEmail: card.sellerPaypalEmail, photos: appendPhotos(card.photos, next.photos.concat(newPhotos)), lockedAt: null };
        return { data, palMessage: `Card version ${data.version} saved. I added what the buyer asked for and noted your reply on the card.` };
      }
      const data: ItemCard = {
        ...card,
        version: card.version + 1,
        conditionNotes: sellerReply ? `${card.conditionNotes} ${sellerReply}`.trim().slice(0, 600) : card.conditionNotes,
        photos: appendPhotos(card.photos, newPhotos),
        serial: buyerRequest.field === "serial" ? (readSerial(sellerReply) ?? card.serial) : card.serial,
        lockedAt: null,
      };
      return { data, palMessage: `Card version ${data.version} saved with your reply about ${buyerRequest.field}.` };
    },

    async shipmentChecklist(deal: Deal, lockedCard: ItemCard): Promise<PalResult<ChecklistItem[]>> {
      const fixture = fixtureById(deal.scenario);
      const items = (fixture?.shipment?.checklist ?? GENERIC_CHECKLIST).map((c) => ({ ...c, done: false }));
      return {
        data: items,
        palMessage: `Payment is in. Pack the ${lockedCard.title} with everything on the card (${lockedCard.included.join(", ")}). Take the two photos below before you seal the box, then give me the tracking number.`,
      };
    },
  };
}
