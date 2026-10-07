/** POST: create the PayPal order for the locked card through PayPalGateway.createDealOrder. */
import { handle, readBody, type Params } from "@/lib/api/handle";
import { OrderBody } from "@/lib/api/schemas";
import { createOrder } from "@/lib/deal/flows/pay";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, OrderBody);
    return createOrder(getServices(), (await params).id, body.method);
  });
}
