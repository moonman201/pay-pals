import { PalAvatar } from "../pal/PalAvatar";
import { LinkIcon, LockIcon } from "../ui/icons";
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


/**
 * The four steps, numbered once. The number is typed into the heading line, so the list carries no
 * marker of its own: list-none is explicit so a change to the base styles cannot bring back "1. 1.".
 */
export function DealSteps() {
  return (
    <ol className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.who} className={`${s.tone} in-box flex gap-3 rounded-2xl border border-[var(--accent-line)] bg-surface p-4 shadow-card`}>
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
  );
}
