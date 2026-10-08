import { isPaymentMethodFlag, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { certSentence } from "@/lib/deal/cert-copy";
import { FLAG_WORDS } from "@/lib/deal/override";
import { hasUsableRange, priceRangeLine, priceSourceNote } from "@/lib/deal/price-copy";
import { OVERALL_LABELS } from "@/lib/labels";
import { Badge, type Tone } from "../ui/Badge";
import { Panel } from "../ui/Panel";

const TONE: Record<Verdict["overall"], Tone> = { go: "go", caution: "caution", stop: "stop" };
const FLAG_TONE: Record<RedFlag["severity"], Tone> = { info: "neutral", caution: "caution", stop: "stop" };

/** The Buyer Pal's review: verdict, price check, flags with evidence, open questions. */
interface Props {
  verdict: Verdict;
  currentVersion: number;
  locked: boolean;
  /** What the card says, for the cert comparison. */
  cardTitle?: string | null;
  cardGrade?: string | null;
}

export function VerdictPanel({ verdict, currentVersion, locked, cardTitle = null, cardGrade = null }: Props) {
  const stale = !locked && verdict.cardVersion > 0 && verdict.cardVersion !== currentVersion;
  return (
    <Panel title="Buyer Pal review" aside={<Badge tone={TONE[verdict.overall]}>{OVERALL_LABELS[verdict.overall]}</Badge>}>
      {stale ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-caution">
          This review was for card version {verdict.cardVersion}. The card is now version {currentVersion}, so it needs another look.
        </p>
      ) : null}
      <p className="text-sm leading-relaxed">{verdict.palMessage}</p>

      <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="price-check">
        <p className="font-semibold">
          {priceRangeLine(verdict.priceCheck)}
          <span className="ml-2 text-xs font-normal text-muted">{priceSourceNote(verdict.priceCheck)}</span>
        </p>
        {hasUsableRange(verdict.priceCheck) && verdict.priceCheck.sources.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {verdict.priceCheck.sources.map((s, i) => (
              <li key={`${s.name}-${i}`}>
                {s.name}
                {s.price !== undefined ? `: $${s.price}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {verdict.certCheck ? (
        <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="cert-check">
          <p className="font-semibold">
            Cert {verdict.certCheck.record.certNumber}:{" "}
            <span className={verdict.certCheck.matches === true ? "text-go" : verdict.certCheck.matches === false ? "text-stop" : "text-muted"}>
              {verdict.certCheck.matches === true ? "matches the card" : verdict.certCheck.matches === false ? "does not match the card" : "could not be compared"}
            </span>
          </p>
          <p className="mt-1">{certSentence(verdict.certCheck, cardGrade).text}</p>
          {cardTitle ? <p className="mt-1 text-xs text-muted">Card: {cardTitle}</p> : null}
          {verdict.certCheck.matches !== null ? <p className="mt-1 text-xs text-muted">{verdict.certCheck.explanation}</p> : null}
        </div>
      ) : null}

      {verdict.flags.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Red flags">
          {verdict.flags.map((f, i) => (
            <li key={`${f.code}-${i}`} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2" data-testid="flag-badges">
                <Badge tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
                <span className="rounded-md border border-line bg-wash px-2 py-0.5 font-semibold">{FLAG_WORDS[f.code]}</span>
                {isPaymentMethodFlag(f) ? <Badge tone="stop">no override</Badge> : null}
              </div>
              <p className="mt-1">{f.explanation}</p>
              <p className="mt-1 text-xs text-muted">{f.evidence}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-go">No red flags.</p>
      )}

      {verdict.questionsForSeller.length > 0 ? (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Asked of the seller</p>
          <ul className="mt-1 list-disc pl-5">
            {verdict.questionsForSeller.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
