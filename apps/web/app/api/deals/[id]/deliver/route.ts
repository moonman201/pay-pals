import { handle, type Params } from "@/lib/api/handle";
import { confirmDelivery } from "@/lib/deal/flows/ship";
import { getServices } from "@/lib/services";

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => confirmDelivery(getServices(), (await params).id));
}
