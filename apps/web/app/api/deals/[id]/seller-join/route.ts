/** POST: the invited seller joins with photos; Seller Pal builds card v1 and the deal is LISTED. */
import { handle, readBody, type Params } from "@/lib/api/handle";
import { SellerJoinBody } from "@/lib/api/schemas";
import { sellerJoin } from "@/lib/deal/flows/invite";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, SellerJoinBody);
    return sellerJoin(getServices(), (await params).id, body);
  });
}
