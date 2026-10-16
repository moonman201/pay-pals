import { isPaymentMethodFlag, type ItemCard, type Message, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { certRows } from "@/lib/deal/cert-compare";
import { certHeadline, graderName } from "@/lib/deal/cert-copy";
import { GRADED_PRICE_LINK_LEAD, GRADED_PRICE_NOTE, gradedPriceLinks, isGradedCard } from "@/lib/deal/graded-price";
import { reasonFor, reviewLead } from "@/lib/deal/review-lead";
import { sellerVoice } from "@/lib/deal/seller-voice";
import { evidenceSourceId } from "@/lib/deal/evidence-source";
import { flagLabel } from "@/lib/deal/override";
import { hasUsableRange, priceRangeLine, priceSourceNote } from "@/lib/deal/price-copy";
import { methodNote, priceText, retailRange, summariseSources } from "@/lib/deal/price-sources";
import { PalAvatar } from "../pal/PalAvatar";
import { PalWork } from "../pal/PalWork";
import { Badge, type Tone } from "../ui/Badge";
import { CheckIcon } from "../ui/icons";
import { Panel } from "../ui/Panel";
import { TAP_LINK_WRAPPING } from "../ui/tap";
import { Comparison } from "./Comparison";
import { FlagEvidence } from "./FlagEvidence";

const FLAG_TONE: Record<RedFlag["severity"], Tone> = { info: "neutral", caution: "caution", stop: "stop" };

/** The detail behind the verdict card: price check, cert comparison, flags with evidence, open questions. */
interface Props {
  verdict: Verdict;
  currentVersion: number;
  locked: boolean;
  /** What the card says, for the cert comparison. */
  cardTitle?: string | null;
  cardGrade?: string | null;
  /** What the seller is asking, to sit beside the retail range. From the same card as the title and the grade. */
  askingPrice?: number | null;
  /** The card itself, for the one case where no price may be shown at all: a graded slab. */
  card?: ItemCard | null;
  /** The shared chat, so a flag's quote can link to the message it was taken from. */
  chat?: readonly Message[];
  /** Whose room this is. The seller is spoken to as "you", never "he" or "the seller". Defaults to the buyer. */
  role?: "buyer" | "seller";
  /**
   * Which half to draw. The verdict itself is on the verdict card at the top of the room, so this panel is
   * the detail behind it: "work" is the pal's findings (flags, price, what it checked), "cert" is the cert
   * comparison, and "all" is both under one title.
   */
  part?: "all" | "work" | "cert";
  /** The cert panel open on load. Open while a deal is live, folded on a finished one, which is a record. */
  certOpen?: boolean;
}

export function VerdictPanel({ verdict, currentVersion, locked, cardTitle = null, cardGrade = null, askingPrice = null, card = null, chat = [], role = "buyer", part = "all", certOpen = false }: Props) {
  const stale = !locked && verdict.cardVersion > 0 && verdict.cardVersion !== currentVersion;
  // Matt, Oct 9: the listings behind the range are a count, a split and prices. Never the shop names.
  const sources = summariseSources(verdict.priceCheck);
  // The sentence that says how the range was reached, so a scaled figure can be checked against the listings under it.
  const method = methodNote(verdict.priceCheck);
  // The prices the lookup actually returned, as opposed to the band derived from them. Null when
  // it returned no new listing, and then the panel is exactly what it was before.
  const retail = retailRange(verdict.priceCheck);
  // A graded card gets no price block at all, whatever the lookup returned for it.
  const graded = isGradedCard(card) ? card : null;
  const seller = role === "seller";
  // The buyer's phrasing, said to the seller. Only the words that name the seller change.
  const say = (text: string) => (seller ? sellerVoice(text) : text);
  const rawLead = reviewLead(verdict);
  const lead = { ...rawLead, reasons: rawLead.reasons.map(say), lookAgain: rawLead.lookAgain === null ? null : say(rawLead.lookAgain), restOfAsks: rawLead.restOfAsks.map(say) };
  const reasoning =
    verdict.reasoning && seller
      ? {
          checked: verdict.reasoning.checked.map(say),
          found: verdict.reasoning.found.map(say),
          couldNotVerify: verdict.reasoning.couldNotVerify.map(say),
          wouldChangeMyMind: verdict.reasoning.wouldChangeMyMind.map(say),
        }
      : verdict.reasoning;
  const showWork = part !== "cert";
  const showCert = part !== "work";
  const content = (
    <>
      {stale && part === "all" ? (
        <p className="mb-3 rounded-lg bg-caution-soft px-3 py-2 text-xs text-caution">
          This review was for card version {verdict.cardVersion}. The card is now version {currentVersion}, so it needs another look.
        </p>
      ) : null}

      {showWork && lead.lookAgain ? (
        <p className="mb-4 text-sm leading-relaxed text-ink" data-testid="look-again">
          <span className="font-bold">{seller ? "The Buyer Pal would look again if" : "I'd look again if"}</span> {lead.lookAgain}
        </p>
      ) : null}

      {showWork && graded ? (
        /*
          No range, no band, no listing count. A graded card is one slab and
          Channel3 prices retail stock, so any number here would be invented.
        */
        <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="price-check">
          <p className="font-semibold">{GRADED_PRICE_NOTE}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1">
            <span>{GRADED_PRICE_LINK_LEAD}</span>
            {gradedPriceLinks(graded).map((link, i) => (
              <span key={link.name} className="inline-flex items-center gap-x-1">
                {i > 0 ? <span>or</span> : null}
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center px-1 font-semibold text-[var(--accent-ink)] underline underline-offset-2"
                >
                  {link.name}
                </a>
              </span>
            ))}
          </p>
        </div>
      ) : showWork ? (
      <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="price-check">
        {retail ? (
          <dl
            className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 sm:grid-cols-[auto_1fr] sm:gap-x-5"
            data-testid="price-comparison"
          >
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Asking price</dt>
              <dd className="mt-0.5 text-2xl font-black leading-none tracking-tight text-ink" data-testid="asking-price">
                {askingPrice === null ? "Not on the card" : priceText(askingPrice)}
              </dd>
            </div>
            <div className="sm:border-l sm:border-[var(--accent-line)] sm:pl-5">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">New at retail</dt>
              <dd className="mt-0.5 text-2xl font-black leading-none tracking-tight text-[var(--accent-ink)]" data-testid="retail-range">
                {retail.text}
              </dd>
              <dd className="mt-1 text-xs text-muted">
                {retail.countLine}, {priceSourceNote(verdict.priceCheck)}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="font-semibold">
          {priceRangeLine(verdict.priceCheck)}
          <span className="ml-2 text-xs font-normal text-muted">{priceSourceNote(verdict.priceCheck)}</span>
        </p>
        {method ? (
          <p className="mt-1 text-xs leading-relaxed text-muted" data-testid="price-method">
            {method}
          </p>
        ) : null}
        {hasUsableRange(verdict.priceCheck) && sources ? (
          <div className="mt-1.5 text-xs text-muted" data-testid="price-sources">
            <p>{sources.line}</p>
            {sources.prices.length > 1 ? (
              /* The range and the count above are the finding. The prices behind them are for a reader who wants to check. */
              <details className="mt-1">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline">
                  Show the {sources.prices.length} listings
                </summary>
                <ul className="mt-1 flex flex-wrap gap-1" aria-label="Listing prices">
                  {sources.prices.map((price, i) => (
                    <li key={`${price}-${i}`} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono">
                      ${price}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}

      {showCert && verdict.certCheck ? (
        <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="cert-check">
          {/*
            One header line, then the table. The closing paragraph used to
            repeat this sentence in other words, which is the thing Matt's
            rule 1 is about: the table is the detail, this is the finding.
          */}
          <p className="font-semibold" data-testid="cert-headline">
            {say(certHeadline(verdict.certCheck))}
          </p>
          <Comparison
            leftTitle="Card says"
            rightTitle={`${graderName(verdict.certCheck)} record says`}
            rows={certRows(verdict.certCheck, cardTitle, cardGrade)}
            caption="The item card against the grader's record for this cert number"
          />
        </div>
      ) : null}

      {showWork ? <PalWork reasoning={reasoning} restOfAsks={lead.restOfAsks} bare={part === "work"} /> : null}

      {showWork && verdict.flags.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Red flags">
          {verdict.flags.map((f, i) => (
            <li key={`${f.code}-${i}`} className="motion-reveal flex gap-3 rounded-lg border border-line p-3 text-sm" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <PalAvatar pal="buyer" size={28} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2" data-testid="flag-badges">
                  <Badge pill tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
                  <span className="rounded-md border border-line bg-wash px-2 py-0.5 font-semibold">{flagLabel(f.code)}</span>
                  {isPaymentMethodFlag(f) ? <Badge pill tone="stop">no override</Badge> : null}
                </div>
                <p className="mt-1">{say(f.explanation.trim() ? f.explanation : reasonFor(f))}</p>
                <FlagEvidence evidence={f.evidence} sourceMessageId={evidenceSourceId(f.evidence, chat)} />
              </div>
            </li>
          ))}
        </ul>
      ) : showWork ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-go">
          <CheckIcon size={16} strokeWidth={3} />
          No red flags.
        </p>
      ) : null}

      {showWork && verdict.questionsForSeller.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Asked of the seller</p>
          <ul className="mt-1 list-disc pl-5">
            {verdict.questionsForSeller.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

    </>
  );
  if (part === "work") return content;
  if (part === "cert") return <Panel title="Cert check" id="cert-check" fold={{ defaultOpen: certOpen }}>{content}</Panel>;
  return <Panel title="Buyer Pal review" id="buyer-pal-review">{content}</Panel>;
}