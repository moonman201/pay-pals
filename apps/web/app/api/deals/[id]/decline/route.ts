/** POST: the seller will not use Pay Pals (from the join page, or relayed by the buyer). */
import { handle, readBody, type Params } from "@/lib/api/handle";
import { DeclineBody } from "@/lib/api/schemas";
import { declineInvite } from "@/lib/deal/flows/invite";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const body = await readBody(req, DeclineBody);
    return declineInvite(getServices(), (await params).id, body);
  });
}
