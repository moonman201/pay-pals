/**
 * POST: the Buyer Pal review.
 *
 * Two answers from one route (Decision 19). A client that asks for
 * text/event-stream gets each finding the moment it lands; anything else
 * gets the finished verdict as JSON, the way this route always worked, so a
 * browser that cannot stream still reviews a deal.
 *
 * The review itself is the same run either way, started through the
 * registry, which is what keeps the verdict saved exactly once no matter how
 * many clients ask or how many walk away.
 */
import { NextResponse } from "next/server";
import { handle, type Params } from "@/lib/api/handle";
import { FlowError } from "@/lib/deal/errors";
import { prepareReview, runReview } from "@/lib/deal/flows/review";
import { keepAliveUntil } from "@/lib/deal/keep-alive";
import { withRequestOrigin } from "@/lib/deal/photo-urls";
import { startOrJoinReview } from "@/lib/deal/review-registry";
import { reviewStreamResponse, streamErrorMessage } from "@/lib/deal/review-stream-response";
import { wantsStream } from "@/lib/deal/review-stream";
import { getServices } from "@/lib/services";

/** Streaming needs a response rendered per request, never a cached one. */
export const dynamic = "force-dynamic";

/**
 * Seconds the function may run. The slowest review measured is about 65 s, so this leaves room
 * for a slow lookup and a retry. It also bounds `after()`: work kept alive past the response
 * still ends at this limit.
 */
export const maxDuration = 300;

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const services = getServices();
  if (!wantsStream(req.headers.get("accept"))) {
    // Same registry as the stream: a second press joins the run in flight instead of starting another.
    return handle(req, async () => {
      await prepareReview(services, id);
      const review = startOrJoinReview(id, (onProgress) => runReview(services, id, { onProgress }));
      keepAliveUntil(review.done);
      return review.done;
    });
  }

  // Checked before the stream opens, because once the body has started there is no status
  // left to send: a deal in the wrong state still gets a plain 409 and a sentence.
  try {
    await withRequestOrigin(req, async () => prepareReview(services, id));
  } catch (error) {
    const status = error instanceof FlowError ? error.status : 500;
    if (status === 500) console.error(error);
    return NextResponse.json({ error: status === 500 ? "Something went wrong on the server." : streamErrorMessage(error) }, { status });
  }

  /*
    Started inside the request's origin context, so the pals get absolute photo URLs, and
    then on its own. Nothing the client does can cancel it: if the tab closes a line after
    the first finding, the review still finishes and still saves its verdict, because the
    save lives in the run and not in the stream, and keepAliveUntil keeps the serverless
    function from being frozen before the save.
  */
  const review = await withRequestOrigin(req, async () => startOrJoinReview(id, (onProgress) => runReview(services, id, { onProgress })));
  // Holds the function open past the end of the response, so the save is guaranteed and not luck.
  keepAliveUntil(review.done);
  return reviewStreamResponse(review);
}
