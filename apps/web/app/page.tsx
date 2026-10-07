import { ALL_FIXTURES } from "@pay-pals/contracts";
import Link from "next/link";
import { ProtectionPanel } from "@/components/landing/ProtectionPanel";
import { ScenarioCard } from "@/components/landing/ScenarioCard";
import { getServices } from "@/lib/services";

const STEPS: { who: string; what: string; tone: "theme-seller" | "theme-buyer" }[] = [
  { who: "You invite the seller", what: "with their PayPal email and the listing link. They get a link to join.", tone: "theme-buyer" },
  { who: "Seller Pal", what: "turns their photos into an item card with the serial or cert number on it.", tone: "theme-seller" },
  { who: "Buyer Pal", what: "checks the price, the cert and the chat. A refusal to use Pay Pals is the strongest warning sign.", tone: "theme-buyer" },
  { who: "Both agree, then proof", what: "the card locks into a PayPal Goods and Services order; packing photos, tracking and an arrival check follow.", tone: "theme-seller" },
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const seeded = await getServices().seededDeals;
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:pt-16">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue">Pay Pals</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-navy sm:text-5xl">Two AI agents. One safe deal.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Buying from a stranger on an online marketplace. Your Buyer Pal vets the listing. The seller&apos;s pal locks the exact item into a PayPal Goods and Services payment.
          Both keep proof until it arrives.
        </p>
      </header>

      <section className="mx-auto mt-10 max-w-2xl">
        <ProtectionPanel />
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.who} className={`${s.tone} rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-4`}>
            <p className="text-xs font-bold text-[var(--accent-ink)]">
              {i + 1}. {s.who}
            </p>
            <p className="mt-1 text-sm text-ink">{s.what}</p>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold text-navy">Try a demo deal</h2>
            <p className="mt-1 text-sm text-muted">Pick a scenario and a side. Nothing to set up. Everything runs on the PayPal sandbox.</p>
          </div>
          <Link href="/deals/new" className="text-sm font-semibold text-navy underline-offset-2 hover:underline">
            Selling? List an item instead
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {ALL_FIXTURES.map((f, i) => (
            <ScenarioCard key={f.id} fixture={f} index={i + 1} finishedDealId={seeded[f.id] ?? null} />
          ))}
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center text-xs text-muted">
        Built for the PayPal AI Hackathon. Sandbox only. Pay Pals never moves money outside a PayPal Goods and Services payment.
      </footer>
    </main>
  );
}
