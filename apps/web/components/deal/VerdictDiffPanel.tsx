import type { RedFlag, Verdict } from "@pay-pals/contracts";
import { FLAG_WORDS } from "@/lib/deal/override";
import type { VerdictDiff } from "@/lib/deal/verdict-diff";
import { formatTime } from "@/lib/format";
import { OVERALL_LABELS } from "@/lib/labels";
import { PalAvatar } from "../pal/PalAvatar";
import { Panel } from "../ui/Panel";
import { CautionIcon, CheckIcon, StopIcon } from "../ui/icons";

const STYLE: Record<Verdict["overall"], { box: string; word: string }> = {
  go: { box: "border-go-line bg-go-soft", word: "text-go" },
  caution: { box: "border-caution-line bg-caution-soft", word: "text-caution" },
  stop: { box: "border-stop-line bg-stop-soft", word: "text-stop" },
};

function Mark({ overall }: { overall: Verdict["overall"] }) {
  if (overall === "stop") return <StopIcon size={20} strokeWidth={2.5} />;
  if (overall === "caution") return <CautionIcon size={20} strokeWidth={2.5} />;
  return <CheckIcon size={20} strokeWidth={3} />;
}

function Side({ label, verdict, flagNote }: { label: string; verdict: Verdict; flagNote: (flag: RedFlag) => string | null }) {
  const style = STYLE[verdict.overall];
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${style.box}`} data-testid="verdict-diff-side" data-overall={verdict.overall}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-xl font-black leading-none tracking-tight ${style.word}`}>
        <Mark overall={verdict.overall} />
        {OVERALL_LABELS[verdict.overall]}
      </p>
      <p className="mt-1 text-xs text-muted">
        Card version {verdict.cardVersion}, {formatTime(verdict.createdAt)}
      </p>
      {verdict.flags.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {verdict.flags.map((flag, i) => {
            const note = flagNote(flag);
            return (
              <li key={`${flag.code}-${i}`} className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-semibold">{FLAG_WORDS[flag.code]}</span>
                <span className="text-xs text-muted">({flag.severity})</span>
                {note ? <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs font-semibold">{note}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm font-semibold text-go">No red flags.</p>
      )}
    </div>
  );
}

/**
 * Two reviews side by side with what changed between them. Shown when new
 * evidence made the Buyer Pal look again, so a reader can see the before and
 * the after without scrolling the timeline.
 */
export function VerdictDiffPanel({ diff }: { diff: VerdictDiff }) {
  const cleared = new Set(diff.cleared.map((f) => f.code));
  const appeared = new Set(diff.appeared.map((f) => f.code));
  return (
    <Panel title="The review, before and after new evidence">
      <div className="flex gap-3">
        <PalAvatar pal="buyer" size={32} className="mt-0.5 shrink-0" />
        <p className="text-sm leading-relaxed text-ink">
          The Buyer Pal reviewed this deal again after the card changed. Both reviews are kept, so nothing is quietly replaced.
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="verdict-diff">
        <Side label="Before" verdict={diff.previous} flagNote={(flag) => (cleared.has(flag.code) ? "cleared" : null)} />
        <Side label="After the new evidence" verdict={diff.current} flagNote={(flag) => (appeared.has(flag.code) ? "new" : null)} />
      </div>
      <div className="mt-3 rounded-lg bg-wash p-3 text-sm">
        <p className="font-semibold">What changed</p>
        {diff.lines.length > 0 ? (
          <ul className="mt-1 list-disc pl-5" data-testid="verdict-diff-lines">
            {diff.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">Nothing. The second review found the same things as the first.</p>
        )}
        {diff.unchangedLine ? <p className="mt-1.5 text-muted">{diff.unchangedLine}</p> : null}
      </div>
    </Panel>
  );
}
