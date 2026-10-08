import { handle, type Params } from "@/lib/api/handle";
import { confirmDelivery } from "@/lib/deal/flows/ship";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => confirmDelivery(getServices(), (await params).id));
}
