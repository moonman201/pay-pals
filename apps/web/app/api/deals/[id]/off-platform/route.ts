/** POST: the buyer says they will pay outside Goods and Services. Pay Pals records it and steps back. */
import { handle, type Params } from "@/lib/api/handle";
import { chooseOffPlatform } from "@/lib/deal/flows/off-platform";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => chooseOffPlatform(getServices(), (await params).id));
}
