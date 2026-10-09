import Link from "next/link";
import { PalAvatar } from "@/components/pal/PalAvatar";
import { StartDealForm } from "@/components/start/StartDealForm";
import { getServices } from "@/lib/services";

export default function NewDealPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-black tracking-tight text-navy">
        <PalAvatar pal="buyer" size={20} />
        <PalAvatar pal="seller" size={20} className="-ml-3.5" />
        Pay Pals
      </Link>
      <h1 className="mt-3 text-3xl font-black text-navy">List an item as the seller</h1>
      <p className="mt-2 text-sm text-muted">
        Paste the listing and your photos. Your pal builds the item card and you share the link with the buyer. If you are the buyer, start from the{" "}
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-navy underline-offset-2 hover:underline">
          home page
        </Link>{" "}
        instead and invite the seller. Money only moves through a PayPal Goods and Services payment to the seller&apos;s account.
      </p>
      <div className="mt-6">
        <StartDealForm uploadsEnabled={getServices().uploadsEnabled} />
      </div>
    </main>
  );
}
