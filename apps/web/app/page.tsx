import { ALL_FIXTURES } from "@pay-pals/contracts";
import Image from "next/image";
import Link from "next/link";
import { DealSteps } from "@/components/landing/DealSteps";
import { HeroHeadline } from "@/components/landing/HeroHeadline";
import { HowItsBuilt } from "@/components/landing/HowItsBuilt";
import { ProtectionPanel } from "@/components/landing/ProtectionPanel";
import { ScenarioCard } from "@/components/landing/ScenarioCard";
import { PalAvatar } from "@/components/pal/PalAvatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { happyPath } from "@/components/landing/happy-path";
import { cleanPathInput } from "@/lib/demo/clean-path";
import { resolveSeededDeals } from "@/lib/demo/live-seeded";
import { asDealFinder } from "@/lib/demo/seed-fixtures";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const services = getServices();
  // Belt and braces. The card's href carries no id, so /deals/finished/<scenario> cannot go
  // stale however long this HTML sits in a cache; this check is the other half, so a card is
  // only offered for a scenario that has a finished deal at the moment of the render.
  // Three lookups, in parallel.
  const seeded = await resolveSeededDeals(await services.seededDeals, services.store, asDealFinder(services.store));
  const cleanPath = happyPath(await cleanPathInput(services.store, seeded["clean-ps5"]));
  return (
    <main className="on-page theme-buyer mx-auto max-w-6xl px-4 pb-16">
      <nav className="flex min-h-14 items-center justify-between gap-4 py-2" aria-label="Site">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-base font-black tracking-tight text-navy">
          <PalAvatar pal="buyer" size={24} />
          <PalAvatar pal="seller" size={24} className="-ml-3" />
          Pay Pals
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link href="/deals/new" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline-offset-4 hover:underline">
            Selling? List an item
          </Link>
        </div>
      </nav>

      <header className="grid items-center gap-6 pt-4 sm:pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        <figure className="order-first m-0 rounded-3xl bg-[var(--hero-frame)] p-2 shadow-card ring-1 ring-line lg:order-none">
          <Image
            src="/pay-pals-hero.jpg"
            alt="The Buyer Pal, a white robot with blue trim, and the Seller Pal, in gold trim, shaking hands over a PayPal Goods and Services shield"
            width={1800}
            height={785}
            priority
            sizes="(min-width: 1024px) 620px, (min-width: 640px) 90vw, 100vw"
            className="hero-art h-auto w-full rounded-2xl"
          />
        </figure>
        <div className="text-center lg:text-left">
          <HeroHeadline />
          {/* The pitch paragraph and the two pals, one tap away. The headline above says it; this says it in full. */}
          <details className="group mx-auto mt-2 max-w-[46ch] lg:mx-0" data-testid="hero-more">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
                &rsaquo;
              </span>
              What Pay Pals does
            </summary>
            <p className="text-base leading-relaxed text-muted">
              Buying from a stranger on an online marketplace. Your Buyer Pal vets the listing. The seller&apos;s pal locks the exact item into a PayPal Goods and Services payment.
              Both keep proof until it arrives.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm font-semibold" aria-label="The two pals">
              <li className="theme-buyer inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] py-1 pl-1 pr-4 text-[var(--accent-ink)]">
                <PalAvatar pal="buyer" size={32} />
                Buyer Pal, on your side
              </li>
              <li className="theme-seller inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] py-1 pl-1 pr-4 text-[var(--accent-ink)]">
                <PalAvatar pal="seller" size={32} />
                Seller Pal, on theirs
              </li>
            </ul>
          </details>
        </div>
      </header>

      <section className="mx-auto mt-10 max-w-2xl sm:mt-14">
        <ProtectionPanel />
      </section>

      <section className="mt-12 sm:mt-16" aria-labelledby="how-title">
        <h2 id="how-title" className="text-xl font-bold text-navy">
          How a deal goes
        </h2>
        <DealSteps />
      </section>

      <section className="mt-12 sm:mt-16" aria-labelledby="demo-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="demo-title" className="text-2xl font-bold text-navy">
              Try a demo deal
            </h2>
            <p className="mt-1 max-w-[60ch] text-sm text-muted">Pick a scenario and a side. Nothing to set up.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {ALL_FIXTURES.map((f) => (
            <ScenarioCard key={f.id} fixture={f} hasFinishedDeal={Boolean(seeded[f.id])} path={f.id === "clean-ps5" ? cleanPath : undefined} />
          ))}
        </div>
      </section>

      <HowItsBuilt />

      <footer className="mt-14 border-t border-line pt-6 text-center text-xs text-muted">
        Built for the PayPal AI Hackathon. Sandbox only. Pay Pals never moves money outside a PayPal Goods and Services payment.
      </footer>
    </main>
  );
}
