import { ALL_FIXTURES } from "@pay-pals/contracts";
import Link from "next/link";
import { ScenarioCard } from "@/components/landing/ScenarioCard";
import { buttonClass } from "@/components/ui/Button";

const STEPS: { who: string; what: string; tone: "theme-seller" | "theme-buyer" }[] = [
  { who: "Seller Pal", what: "turns the listing and photos into an item card with the serial on it.", tone: "theme-seller" },
  { who: "Buyer Pal", what: "checks the price against the market and reads the chat for scam patterns.", tone: "theme-buyer" },
  { who: "Both sides agree", what: "and the card locks. The locked card becomes the PayPal Goods and Services order.", tone: "theme-buyer" },
  { who: "Proof until it arrives", what: "packing photos, tracking, an arrival check against the serial, and an evidence pack if anything is off.", tone: "theme-seller" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:pt-16">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue">Pay Pals</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-navy sm:text-5xl">Two AI agents. One safe deal.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Buying from a stranger on an online marketplace. The Buyer Pal vets the listing. The Seller Pal locks the exact item into a PayPal Goods and
          Services payment. Both keep proof until it arrives.
        </p>
      </header>

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
          <Link href="/deals/new" className={buttonClass("secondary")}>
            Start a real deal
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {ALL_FIXTURES.map((f, i) => (
            <ScenarioCard key={f.id} fixture={f} index={i + 1} />
          ))}
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center text-xs text-muted">
        Built for the PayPal AI Hackathon. Sandbox only. Pay Pals never moves money outside a PayPal Goods and Services payment.
      </footer>
    </main>
  );
}
