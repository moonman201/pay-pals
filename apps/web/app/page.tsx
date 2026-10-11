import { ALL_FIXTURES } from "@pay-pals/contracts";
import Image from "next/image";
import Link from "next/link";
import { ProtectionPanel } from "@/components/landing/ProtectionPanel";
import { ScenarioCard } from "@/components/landing/ScenarioCard";
import { PalAvatar } from "@/components/pal/PalAvatar";
import { LinkIcon, LockIcon } from "@/components/ui/icons";
import { resolveSeededDeals } from "@/lib/demo/live-seeded";
import { asDealFinder } from "@/lib/demo/seed-fixtures";
import { getServices } from "@/lib/services";
import type { Role } from "@/lib/role";

type Step = { who: string; what: string; tone: "theme-seller" | "theme-buyer"; pal: Role | null };

const STEPS: Step[] = [
  { who: "You invite the seller", what: "with their PayPal email and the listing link. They get a link to join.", tone: "theme-buyer", pal: null },
  { who: "Seller Pal", what: "turns their photos into an item card with the serial or cert number on it.", tone: "theme-seller", pal: "seller" },
  { who: "Buyer Pal", what: "checks the price, the cert and the chat. A refusal to use Pay Pals is a risk signal.", tone: "theme-buyer", pal: "buyer" },
  { who: "Both agree, then proof", what: "the card locks into a PayPal Goods and Services order; packing photos, tracking and an arrival check follow.", tone: "theme-seller", pal: null },
];

function StepMark({ step }: { step: Step }) {
  if (step.pal) return <PalAvatar pal={step.pal} size={40} />;
  const Icon = step.who.startsWith("You") ? LinkIcon : LockIcon;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] ring-2 ring-[var(--accent)]">
      <Icon size={20} />
    </span>
  );
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const services = getServices();
  // Belt and braces. The card's href carries no id, so /deals/finished/<scenario> cannot go
  // stale however long this HTML sits in a cache; this check is the other half, so a card is
  // only offered for a scenario that has a finished deal at the moment of the render.
  // Three lookups, in parallel.
  const seeded = await resolveSeededDeals(await services.seededDeals, services.store, asDealFinder(services.store));
  return (
    <main className="mx-auto max-w-6xl px-4 pb-16">
      <nav className="flex min-h-14 items-center justify-between gap-4 py-2" aria-label="Site">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-base font-black tracking-tight text-navy">
          <PalAvatar pal="buyer" size={24} />
          <PalAvatar pal="seller" size={24} className="-ml-3" />
          Pay Pals
        </Link>
        <Link href="/deals/new" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy underline-offset-4 hover:underline">
          Selling? List an item
        </Link>
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
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-navy sm:text-5xl lg:text-[3.4rem]">Two AI agents. One safe deal.</h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-base leading-relaxed text-muted sm:text-lg lg:mx-0">
            Buying from a stranger on an online marketplace. Your Buyer Pal vets the listing. The seller&apos;s pal locks the exact item into a PayPal Goods and Services payment.
            Both keep proof until it arrives.
          </p>
          <ul className="mt-5 flex flex-wrap justify-center gap-2 text-sm font-semibold lg:justify-start" aria-label="The two pals">
            <li className="theme-buyer inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] py-1 pl-1 pr-4 text-[var(--accent-ink)]">
              <PalAvatar pal="buyer" size={32} />
              Buyer Pal, on your side
            </li>
            <li className="theme-seller inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] py-1 pl-1 pr-4 text-[var(--accent-ink)]">
              <PalAvatar pal="seller" size={32} />
              Seller Pal, on theirs
            </li>
          </ul>
        </div>
      </header>

      <section className="mx-auto mt-10 max-w-2xl sm:mt-14">
        <ProtectionPanel />
      </section>

      <section className="mt-12 sm:mt-16" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-bold text-navy">
          How a deal goes
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.who} className={`${s.tone} flex gap-3 rounded-2xl border border-[var(--accent-line)] bg-surface p-4 shadow-card`}>
              <StepMark step={s} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--accent-ink)]">
                  <span className="text-muted">{i + 1}. </span>
                  {s.who}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{s.what}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 sm:mt-16" aria-labelledby="demo-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="demo-title" className="text-2xl font-bold text-navy">
              Try a demo deal
            </h2>
            <p className="mt-1 max-w-[60ch] text-sm text-muted">Pick a scenario and a side. Nothing to set up. Everything runs on the PayPal sandbox.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {ALL_FIXTURES.map((f) => (
            <ScenarioCard key={f.id} fixture={f} hasFinishedDeal={Boolean(seeded[f.id])} />
          ))}
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center text-xs text-muted">
        Built for the PayPal AI Hackathon. Sandbox only. Pay Pals never moves money outside a PayPal Goods and Services payment.
      </footer>
    </main>
  );
}
