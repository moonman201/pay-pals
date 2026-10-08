import { handle, type Params } from "@/lib/api/handle";
import { completeDeal } from "@/lib/deal/flows/close";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => completeDeal(getServices(), (await params).id));
}
