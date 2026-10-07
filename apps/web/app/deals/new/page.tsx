import Link from "next/link";
import { StartDealForm } from "@/components/start/StartDealForm";

export default function NewDealPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href="/" className="text-sm font-black tracking-tight text-navy">
        Pay Pals
      </Link>
      <h1 className="mt-4 text-3xl font-black text-navy">Start a deal</h1>
      <p className="mt-2 text-sm text-muted">
        Paste the listing. Your pal builds the item card. Share the link with the other side. The deal only moves money through a PayPal Goods and Services payment to
        the seller&apos;s account.
      </p>
      <div className="mt-6">
        <StartDealForm />
      </div>
    </main>
  );
}
