import { handle, readBody, type Params } from "@/lib/api/handle";
import { ByBody } from "@/lib/api/schemas";
import { cancelDeal } from "@/lib/deal/flows/close";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, ByBody);
    return cancelDeal(getServices(), (await params).id, body.by);
  });
}
