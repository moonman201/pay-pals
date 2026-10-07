import Link from "next/link";
import { StartDealForm } from "@/components/start/StartDealForm";

export default function NewDealPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href="/" className="text-sm font-black tracking-tight text-navy">
        Pay Pals
      </Link>
      <h1 className="mt-4 text-3xl font-black text-navy">List an item as the seller</h1>
      <p className="mt-2 text-sm text-muted">
        Paste the listing and your photos. Your pal builds the item card and you share the link with the buyer. If you are the buyer, start from the{" "}
        <Link href="/" className="font-semibold text-navy underline-offset-2 hover:underline">
          home page
        </Link>{" "}
        instead and invite the seller. Money only moves through a PayPal Goods and Services payment to the seller&apos;s account.
      </p>
      <div className="mt-6">
        <StartDealForm />
      </div>
    </main>
  );
}
