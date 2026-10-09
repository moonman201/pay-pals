import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProgressStepper } from "@/components/deal/ProgressStepper";
import { SellerJoinForm } from "@/components/join/SellerJoinForm";
import { PalAvatar } from "@/components/pal/PalAvatar";
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
      <div className="theme-seller min-h-screen">
        <header className="border-b border-[var(--accent-line)] bg-surface">
          <div className="mx-auto max-w-2xl px-4">
            <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-black tracking-tight text-navy">
              <PalAvatar pal="buyer" size={20} />
              <PalAvatar pal="seller" size={20} className="-ml-3.5" />
              Pay Pals
            </Link>
          </div>
          <div className="mx-auto max-w-2xl px-4 pb-1">
            <ProgressStepper state={snapshot.deal.state} events={snapshot.events} />
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
          <div className="flex gap-3 sm:gap-4">
            <PalAvatar pal="seller" size={56} className="mt-1" />
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-navy sm:text-3xl">{snapshot.deal.buyer?.displayName ?? "A buyer"} wants to buy from you with Pay Pals Protection</h1>
              <p className="mt-2 text-sm text-muted">
                You get paid through a PayPal Goods and Services payment to your own PayPal account. Your Seller Pal turns your photos into an item card; the buyer&apos;s pal
                checks it; both of you agree before any money moves.
              </p>
            </div>
          </div>
          <div className="mt-6">
            <SellerJoinForm deal={snapshot.deal} uploadsEnabled={snapshot.uploadsEnabled} />
          </div>
        </main>
      </div>
    );
  } catch (e) {
    if (e instanceof FlowError && e.status === 404) notFound();
    throw e;
  }
}
