/**
 * The legibility gate, both halves: the pure decision, and readPhoto applying
 * it to what the vision model answered. The case these exist for is the clean
 * deal's wide shot of the console back, where the real model transcribed
 * AJ16495258Q off a sticker that is a few pixels tall and the Buyer Pal then
 * spent its review on a one-character mismatch against the box label.
 */
import { describe, expect, it } from "vitest";
import type { Photo } from "@pay-pals/contracts";
import { fakeClaude, promptText } from "../testing/fake-claude";
import { asFetched, pictureA } from "../testing/images";
import { photoFactsBlock } from "../buyer/photo-facts";
import { readPhoto } from "./read-photo";
import { asReasonClause, DEFAULT_UNREADABLE_REASON, judgeSerial } from "./serial-legibility";

describe("asReasonClause", () => {
  it("reads correctly after the word because", () => {
    expect(asReasonClause("The sticker is a thin strip in a wide shot.")).toBe("the sticker is a thin strip in a wide shot");
  });

  it("leaves a name or a part number with the case it was written in", () => {
    expect(asReasonClause("Sony printed it below the barcode.")).toBe("Sony printed it below the barcode");
  });

  it("is empty when the model said nothing, so the caller can fall back", () => {
    expect(asReasonClause("   ")).toBe("");
  });
});

describe("judgeSerial", () => {
  it("keeps a serial the model called sharp", () => {
    expect(judgeSerial("AJ164952580", "sharp")).toEqual({ serial: "AJ164952580", illegible: false });
  });

  it("throws away a serial the model called small or soft, however confident the characters look", () => {
    expect(judgeSerial("AJ16495258Q", "small_or_soft")).toEqual({ serial: null, illegible: true });
  });

  it("records a serial that is in the picture and unreadable, even when no characters came back", () => {
    expect(judgeSerial(null, "small_or_soft")).toEqual({ serial: null, illegible: true });
  });

  it("is not illegible when there is simply no serial in the picture", () => {
    expect(judgeSerial(null, "none")).toEqual({ serial: null, illegible: false });
    expect(judgeSerial(null, null)).toEqual({ serial: null, illegible: false });
  });

  it("treats a missing legibility answer as sharp, so a degraded response does not drop every serial", () => {
    expect(judgeSerial("AJ164952580", null)).toEqual({ serial: "AJ164952580", illegible: false });
  });
});

const photo: Photo = {
  url: "https://example.test/console-back.jpg",
  whatItShows: "Back of a white PlayStation 5. A barcode sticker sits to the right, too small in this shot to read.",
  addedBy: "seller",
  addedAt: "2026-10-21T16:03:00.000Z",
};

const deps = (reading: Record<string, unknown>) => ({
  client: fakeClaude(() => reading),
  fetchImage: async () => asFetched(pictureA()),
  photoBaseUrl: "https://example.test",
});

describe("readPhoto applies the gate", () => {
  it("drops the wide shot's guessed serial and says why", async () => {
    const result = await readPhoto(photo, {
      ...deps({
        brand: "Sony",
        model: "CFI-1015A",
        serial: "AJ16495258Q",
        serial_legibility: "small_or_soft",
        uncertain_characters: ["position 11: 0 or Q"],
        unreadable_reason: "the sticker is a thin strip in a wide shot of the whole console",
        serial_on: "item",
        item_present: true,
      }),
    });
    expect(result.serial).toBeNull();
    expect(result.serialOn).toBeNull();
    expect(result.serialIllegible).toBe(true);
    expect(result.serialIllegibleReason).toBe("the sticker is a thin strip in a wide shot of the whole console");
    // The rest of the reading is still usable; only the serial is in doubt.
    expect(result.brand).toBe("Sony");
    expect(result.model).toBe("CFI-1015A");
    expect(result.imageStatus).toBe("read");
  });

  it("falls back to a plain reason when the model gave none", async () => {
    const result = await readPhoto(photo, {
      ...deps({ brand: null, model: null, serial: "AJ16495258Q", serial_legibility: "small_or_soft", uncertain_characters: [], unreadable_reason: null, serial_on: "item", item_present: true }),
    });
    expect(result.serialIllegibleReason).toBe(DEFAULT_UNREADABLE_REASON);
  });

  it("keeps the close-up's serial", async () => {
    const result = await readPhoto(photo, {
      ...deps({ brand: null, model: null, serial: "AJ164952580", serial_legibility: "sharp", uncertain_characters: [], unreadable_reason: null, serial_on: "item", item_present: true }),
    });
    expect(result.serial).toBe("AJ164952580");
    expect(result.serialOn).toBe("item");
    expect(result.serialIllegible).toBe(false);
    expect(result.serialIllegibleReason).toBeNull();
  });

  it("keeps a sharp serial the model hedged a character on, because that hedge does not tell good reads from bad", async () => {
    const result = await readPhoto(photo, {
      ...deps({ brand: null, model: null, serial: "AJ164952580", serial_legibility: "sharp", uncertain_characters: ["position 11: 0 or O"], unreadable_reason: null, serial_on: "packaging", item_present: false }),
    });
    expect(result.serial).toBe("AJ164952580");
  });

  it("asks the model to judge the picture and to name what it cannot resolve", async () => {
    const client = fakeClaude(() => ({ brand: null, model: null, serial: null, serial_legibility: "none", uncertain_characters: [], unreadable_reason: null, serial_on: null, item_present: true }));
    await readPhoto(photo, { client, fetchImage: async () => asFetched(pictureA()), photoBaseUrl: "https://example.test" });
    const sent = promptText(client.calls[0]!);
    expect(sent).toMatch(/judge the picture rather than how sure you feel/i);
    const tool = client.calls[0]!.tools![0] as { input_schema: { required: string[] } };
    expect(tool.input_schema.required).toContain("serial_legibility");
    expect(tool.input_schema.required).toContain("uncertain_characters");
  });

  it("tells the review model there is no number to compare, rather than leaving it to guess", async () => {
    const reading = await readPhoto(photo, {
      ...deps({ brand: "Sony", model: "CFI-1015A", serial: "AJ16495258Q", serial_legibility: "small_or_soft", uncertain_characters: [], unreadable_reason: "the sticker is tiny in this shot", serial_on: "item", item_present: true }),
    });
    const block = photoFactsBlock([reading]);
    expect(block).toContain("could not be read");
    expect(block).toContain("the sticker is tiny in this shot");
    expect(block).toContain("Do not guess one");
    expect(block).not.toContain("AJ16495258Q");
  });
});
