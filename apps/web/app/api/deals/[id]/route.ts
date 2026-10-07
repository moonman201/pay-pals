/** GET: the full snapshot of a deal, for tests and debugging. */
import { handle, type Params } from "@/lib/api/handle";
import { loadSnapshot } from "@/lib/deal/snapshot";
import { getServices } from "@/lib/services";

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => loadSnapshot(getServices(), (await params).id));
}
