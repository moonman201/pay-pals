/** POST: buyer-first start. The buyer invites the seller by PayPal email; the deal waits in INVITED. */
import { handle, readBody } from "@/lib/api/handle";
import { InviteBody } from "@/lib/api/schemas";
import { startBuyerFirst } from "@/lib/deal/flows/invite";
import { getServices } from "@/lib/services";

export async function POST(req: Request) {
  return handle(req, async () => {
    const body = await readBody(req, InviteBody);
    const deal = await startBuyerFirst(getServices(), body);
    return { dealId: deal.id };
  });
}
