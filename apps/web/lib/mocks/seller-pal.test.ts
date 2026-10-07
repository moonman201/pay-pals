import { cleanGarmin } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createMockSellerPal } from "./seller-pal";

const pal = createMockSellerPal();
const base = { dealId: "d1", photos: [], sellerNotes: "", sellerPaypalEmail: "sam@example.com" };

describe("mock SellerPal.buildCard", () => {
  it("returns the scenario card for a pasted demo listing", async () => {
    const { data } = await pal.buildCard({ ...base, listingText: cleanGarmin.listingText });
    expect(data.serial).toBe("7LP045912");
    expect(data.askingPrice).toBe(475);
    expect(data.dealId).toBe("d1");
    expect(data.sellerPaypalEmail).toBe("sam@example.com");
  });

  it("reads the price and serial from plain listing text", async () => {
    const { data } = await pal.buildCard({ ...base, listingText: "Nintendo Switch OLED, good condition, $240. Serial XKW70012345678." });
    expect(data.askingPrice).toBe(240);
    expect(data.serial).toBe("XKW70012345678");
    expect(data.conditionGrade).toBe("good");
  });

  it("uses the typed price when the listing names none, and refuses when neither does", async () => {
    const { data } = await pal.buildCard({ ...base, listingText: "Sony headphones, like new, box included.", askingPrice: 220 });
    expect(data.askingPrice).toBe(220);
    expect(data.conditionGrade).toBe("like_new");
    await expect(pal.buildCard({ ...base, listingText: "Sony headphones, like new, box included." })).rejects.toMatchObject({ name: "MissingPriceError" });
  });
});
