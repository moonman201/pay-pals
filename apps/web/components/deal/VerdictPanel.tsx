import { isPaymentMethodFlag, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { FLAG_WORDS } from "@/lib/deal/override";
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

      {verdict.priceCheck ? (
        <div className="mt-4 rounded-lg bg-wash p-3 text-sm">
          <p className="font-semibold">
            Market range ${verdict.priceCheck.marketLow} to ${verdict.priceCheck.marketHigh}
            <span className="ml-2 text-xs font-normal text-muted">{verdict.priceCheck.provider === "channel3" ? "via Channel3" : "demo prices"}</span>
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {verdict.priceCheck.sources.map((s, i) => (
              <li key={`${s.name}-${i}`}>
                {s.name}
                {s.price !== undefined ? `: $${s.price}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {verdict.certCheck ? (
        <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="cert-check">
          <p className="font-semibold">
            Cert {verdict.certCheck.record.certNumber} at {verdict.certCheck.record.provider === "psa" ? "PSA" : "the grader (demo record)"}:{" "}
            <span className={verdict.certCheck.matches === true ? "text-go" : verdict.certCheck.matches === false ? "text-stop" : "text-muted"}>
              {verdict.certCheck.matches === true ? "matches the card" : verdict.certCheck.matches === false ? "does not match the card" : "could not be compared"}
            </span>
          </p>
          <dl className="mt-1 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
            <div>
              <dt className="uppercase">Record says</dt>
              <dd className="text-ink">
                {verdict.certCheck.record.subject ?? "no record"}
                {verdict.certCheck.record.grade ? `, grade ${verdict.certCheck.record.grade}` : ""}
              </dd>
            </div>
            <div>
              <dt className="uppercase">Card says</dt>
              <dd className="text-ink">{cardTitle ?? "see the item card"}{cardGrade ? `, ${cardGrade}` : ""}</dd>
            </div>
          </dl>
          <p className="mt-1 text-xs">{verdict.certCheck.explanation}</p>
        </div>
      ) : null}

      {verdict.flags.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Red flags">
          {verdict.flags.map((f, i) => (
            <li key={`${f.code}-${i}`} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
                <span className="font-semibold">{FLAG_WORDS[f.code]}</span>
                {isPaymentMethodFlag(f) ? <span className="text-xs text-stop">payment method, no override</span> : null}
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
