import { isPaymentMethodFlag, type RedFlag, type Verdict } from "@pay-pals/contracts";
import { certRows } from "@/lib/deal/cert-compare";
import { certSentence } from "@/lib/deal/cert-copy";
import { FLAG_WORDS } from "@/lib/deal/override";
import { hasUsableRange, priceRangeLine, priceSourceNote } from "@/lib/deal/price-copy";
import { methodNote, summariseSources } from "@/lib/deal/price-sources";
import { OVERALL_LABELS } from "@/lib/labels";
import { PalAvatar } from "../pal/PalAvatar";
import { PalReasons } from "../pal/PalReasons";
import { Badge, type Tone } from "../ui/Badge";
import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";
import { Panel } from "../ui/Panel";
import { Comparison } from "./Comparison";
import { FlagEvidence } from "./FlagEvidence";

const FLAG_TONE: Record<RedFlag["severity"], Tone> = { info: "neutral", caution: "caution", stop: "stop" };

const VERDICT_STYLE: Record<Verdict["overall"], { box: string; word: string }> = {
  go: { box: "border-go-line bg-go-soft", word: "text-go" },
  caution: { box: "border-caution-line bg-caution-soft", word: "text-caution" },
  stop: { box: "border-stop-line bg-stop-soft", word: "text-stop" },
};

function VerdictIcon({ overall }: { overall: Verdict["overall"] }) {
  if (overall === "stop") return <StopIcon size={28} strokeWidth={2.5} />;
  if (overall === "caution") return <CautionIcon size={28} strokeWidth={2.5} />;
  return <CheckIcon size={28} strokeWidth={3} />;
}

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
  // Matt, Oct 9: the listings behind the range are a count, a split and prices. Never the shop names.
  const sources = summariseSources(verdict.priceCheck);
  // The sentence that says how the range was reached, so a scaled figure can be checked against the listings under it.
  const method = methodNote(verdict.priceCheck);
  const style = VERDICT_STYLE[verdict.overall];
  return (
    <Panel title="Buyer Pal review">
      {stale ? (
        <p className="mb-3 rounded-lg bg-caution-soft px-3 py-2 text-xs text-caution">
          This review was for card version {verdict.cardVersion}. The card is now version {currentVersion}, so it needs another look.
        </p>
      ) : null}

      <div className={`motion-reveal flex gap-3 rounded-xl border p-4 sm:gap-4 ${style.box}`} data-testid="verdict" data-overall={verdict.overall}>
        <PalAvatar pal="buyer" size={56} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-2 text-3xl font-black leading-none tracking-tight ${style.word}`}>
            <VerdictIcon overall={verdict.overall} />
            {OVERALL_LABELS[verdict.overall]}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink">{verdict.palMessage}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-wash p-3 text-sm" data-testid="price-check">
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
              <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Listing prices">
                {sources.prices.map((price, i) => (
                  <li key={`${price}-${i}`} className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono">
                    ${price}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
          <Comparison
            leftTitle="Card says"
            rightTitle={`${verdict.certCheck.record.provider === "psa" ? "PSA" : "PSA (demo record)"} says`}
            rows={certRows(verdict.certCheck, cardTitle, cardGrade)}
            caption="The item card against the grader's record for this cert number"
          />
          {verdict.certCheck.matches !== null ? <p className="mt-1 text-xs text-muted">{verdict.certCheck.explanation}</p> : null}
        </div>
      ) : null}

      <PalReasons reasoning={verdict.reasoning} pal="buyer" only={["checked", "found", "couldNotVerify"]} className="mt-4" />

      {verdict.flags.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Red flags">
          {verdict.flags.map((f, i) => (
            <li key={`${f.code}-${i}`} className="motion-reveal flex gap-3 rounded-lg border border-line p-3 text-sm" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
              <PalAvatar pal="buyer" size={28} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2" data-testid="flag-badges">
                  <Badge tone={FLAG_TONE[f.severity]}>{f.severity}</Badge>
                  <span className="rounded-md border border-line bg-wash px-2 py-0.5 font-semibold">{FLAG_WORDS[f.code]}</span>
                  {isPaymentMethodFlag(f) ? <Badge tone="stop">no override</Badge> : null}
                </div>
                <p className="mt-1">{f.explanation}</p>
                <FlagEvidence evidence={f.evidence} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-go">
          <CheckIcon size={16} strokeWidth={3} />
          No red flags.
        </p>
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

      {/* The ask sits with the questions for the seller, which is what it is, rather than repeating them higher up. */}
      <PalReasons reasoning={verdict.reasoning} pal="buyer" only={["wouldChangeMyMind"]} className="mt-4" />
    </Panel>
  );
}
