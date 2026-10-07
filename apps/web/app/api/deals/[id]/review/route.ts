import { handle, type Params } from "@/lib/api/handle";
import { runReview } from "@/lib/deal/flows/review";
import { getServices } from "@/lib/services";

export async function POST(_req: Request, { params }: Params) {
  return handle(async () => runReview(getServices(), (await params).id));
}
