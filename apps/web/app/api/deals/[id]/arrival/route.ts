import { handle, readBody, type Params } from "@/lib/api/handle";
import { ArrivalBody } from "@/lib/api/schemas";
import { checkArrival } from "@/lib/deal/flows/arrival";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const body = await readBody(req, ArrivalBody);
    return checkArrival(getServices(), (await params).id, body.photos);
  });
}
