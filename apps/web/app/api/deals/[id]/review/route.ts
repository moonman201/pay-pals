import { handle, type Params } from "@/lib/api/handle";
import { runReview } from "@/lib/deal/flows/review";
import { getServices } from "@/lib/services";

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => runReview(getServices(), (await params).id));
}
