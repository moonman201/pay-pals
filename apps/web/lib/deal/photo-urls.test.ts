import { cleanPs5, type BuildCardInput, type ItemCard, type Photo } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { createServices } from "../services";
import { sellerJoin, startBuyerFirst } from "./flows/invite";
import { absoluteCard, absolutePhotos, absoluteUrl, originOf, photoBase, withRequestOrigin } from "./photo-urls";

describe("photo URLs for the pals", () => {
  it("resolves app-relative URLs against NEXT_PUBLIC_APP_URL first, then the request origin, and leaves absolute ones alone", async () => {
    expect(absoluteUrl("/fixtures/a.jpg", "https://pay-pals.example")).toBe("https://pay-pals.example/fixtures/a.jpg");
    expect(absoluteUrl("https://cdn.example/x.jpg", "https://pay-pals.example")).toBe("https://cdn.example/x.jpg");
    expect(absoluteUrl("/fixtures/a.jpg", null)).toBe("/fixtures/a.jpg");
    expect(photoBase({ NEXT_PUBLIC_APP_URL: "https://configured.example/" })).toBe("https://configured.example");
    const req = new Request("http://internal:3000/api/deals/x", { headers: { host: "host", "x-forwarded-proto": "https", "x-forwarded-host": "host" } });
    expect(originOf(req)).toBe("https://host");
    await withRequestOrigin(req, async () => {
      expect(photoBase({})).toBe("https://host");
      expect(absolutePhotos([{ url: "/fixtures/a.jpg", whatItShows: "a", addedBy: "seller" }], photoBase({}))[0]?.url).toBe("https://host/fixtures/a.jpg");
    });
    expect(photoBase({})).toBeNull();
  });

  it("a pal receives https://host/fixtures/... when the request came from https://host, and the stored card keeps the relative URL", async () => {
    const services = createServices({}, () => {});
    const seen: { built: BuildCardInput | null } = { built: null };
    const realSellerPal = services.sellerPal;
    services.sellerPal = {
      ...realSellerPal,
      buildCard: (input) => {
        seen.built = input;
        return realSellerPal.buildCard(input);
      },
    };
    const deal = await startBuyerFirst(services, { buyer: { displayName: "Priya S.", email: "priya.s@example.com" }, sellerEmail: "matt.m@example.com", listingUrl: null });
    const req = new Request("https://host/api/deals/x/seller-join", { headers: { host: "host" } });
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    try {
      await withRequestOrigin(req, () =>
        sellerJoin(services, deal.id, {
          displayName: "Matt M.",
          sellerPaypalEmail: "matt.m@example.com",
          listingText: cleanPs5.listingText,
          sellerNotes: cleanPs5.sellerNotes,
          photos: cleanPs5.listingPhotos,
        }),
      );
    } finally {
      if (previous !== undefined) process.env.NEXT_PUBLIC_APP_URL = previous;
    }
    const palPhotos: Photo[] = seen.built?.photos ?? [];
    expect(palPhotos[0]?.url).toBe(`https://host${cleanPs5.listingPhotos[0]!.url}`);
    const stored: ItemCard | null = await services.store.getCurrentCard(deal.id);
    expect(stored?.photos[0]?.url).toBe(cleanPs5.listingPhotos[0]!.url);
    expect(absoluteCard(stored!, "https://host").photos.every((p) => p.url.startsWith("https://host/"))).toBe(true);
  });
});
