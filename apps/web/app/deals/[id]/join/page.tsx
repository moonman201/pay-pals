import { notFound, redirect } from "next/navigation";
import { SellerJoinForm } from "@/components/join/SellerJoinForm";
import { FlowError } from "@/lib/deal/errors";
import { canSellerJoin } from "@/lib/deal/flows/invite";
import { loadSnapshot } from "@/lib/deal/snapshot";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** The seller's invite link. Once the seller has joined or the deal moved on, it is the seller's view of the room. */
export default async function JoinPage({ params }: Props) {
  const { id } = await params;
  try {
    const snapshot = await loadSnapshot(getServices(), id);
    if (!canSellerJoin(snapshot.deal) || snapshot.inviteDeclined) redirect(`/deals/${id}?as=seller`);
    return (
      <main className="theme-seller mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <p className="text-sm font-black tracking-tight text-navy">Pay Pals</p>
        <h1 className="mt-4 text-3xl font-black text-navy">{snapshot.deal.buyer?.displayName ?? "A buyer"} wants to buy from you with Pay Pals Protection</h1>
        <p className="mt-2 text-sm text-muted">
          You get paid through a PayPal Goods and Services payment to your own PayPal account. Your Seller Pal turns your photos into an item card; the buyer&apos;s pal checks it;
          both of you agree before any money moves.
        </p>
        <div className="mt-6">
          <SellerJoinForm deal={snapshot.deal} uploadsEnabled={snapshot.uploadsEnabled} />
        </div>
      </main>
    );
  } catch (e) {
    if (e instanceof FlowError && e.status === 404) notFound();
    throw e;
  }
}
