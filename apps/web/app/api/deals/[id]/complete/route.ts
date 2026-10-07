import { handle, type Params } from "@/lib/api/handle";
import { completeDeal } from "@/lib/deal/flows/close";
import { getServices } from "@/lib/services";

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => completeDeal(getServices(), (await params).id));
}
