/** POST: a seller-started deal from the start form. Buyer-first starts go to /api/deals/invite. */
import { handle, readBody } from "@/lib/api/handle";
import { StartDealBody } from "@/lib/api/schemas";
import { startDeal } from "@/lib/deal/flows/start";
import { getServices } from "@/lib/services";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readBody(req, StartDealBody);
    const deal = await startDeal(getServices(), {
      seller: { role: "seller", ...body.seller },
      listingText: body.listingText,
      sellerNotes: body.sellerNotes,
      photos: body.photos,
      sellerPaypalEmail: body.sellerPaypalEmail,
      askingPrice: body.askingPrice,
    });
    return { dealId: deal.id };
  });
}
