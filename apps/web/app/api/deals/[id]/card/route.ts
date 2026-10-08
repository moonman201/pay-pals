import { handle, readBody, type Params } from "@/lib/api/handle";
import { CardBody } from "@/lib/api/schemas";
import { applyBuyerRequest } from "@/lib/deal/flows/card";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const body = await readBody(req, CardBody);
    return applyBuyerRequest(getServices(), (await params).id, body);
  });
}
