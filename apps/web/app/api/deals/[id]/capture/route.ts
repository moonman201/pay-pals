/** POST: capture an approved order through PayPalGateway.captureOrder and mark the deal paid. */
import { handle, readBody, type Params } from "@/lib/api/handle";
import { CaptureBody } from "@/lib/api/schemas";
import { captureOrder } from "@/lib/deal/flows/pay";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, CaptureBody);
    return captureOrder(getServices(), (await params).id, body.orderId);
  });
}
