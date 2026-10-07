import { handle, readBody, type Params } from "@/lib/api/handle";
import { ShipBody } from "@/lib/api/schemas";
import { markShipped } from "@/lib/deal/flows/ship";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const body = await readBody(req, ShipBody);
    return markShipped(getServices(), (await params).id, body);
  });
}
