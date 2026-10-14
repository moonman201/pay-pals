import type { DealSnapshot } from "@/lib/deal/snapshot";
import { endSentence } from "@/lib/format";
import type { Role } from "@/lib/role";
import { PalAvatar } from "../pal/PalAvatar";
import { Badge } from "../ui/Badge";
import { HistoryBadge } from "./HistoryBadge";
import { ProgressStepper } from "./ProgressStepper";

/**
 * What the header says in a word or two, said in full. It sits at the top of the Deal status section:
 * who you are in this room, the example-deal label, the history seal with its whole sentence, and the
 * seven-step progress with the steps a closed deal will never reach.
 */
export function DealFacts({ snapshot, role }: { snapshot: DealSnapshot; role: Role }) {
  const { deal } = snapshot;
  const me = role === "buyer" ? deal.buyer : deal.seller;
  return (
    <div className="space-y-3" data-testid="deal-facts">
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink">
        <span>{endSentence(`You are the ${role}${me ? `, ${me.displayName}` : ""}`)}</span>
        <span className="inline-flex items-center gap-1">
          <PalAvatar pal={role} size={18} />
          {role === "buyer" ? "Your Buyer Pal is blue." : "Your Seller Pal is gold."}
        </span>
      </p>
      {snapshot.example ? (
        <p>
          <Badge tone="neutral" className="py-1 font-normal" data-testid="example-label">
            Example deal, seeded from a scenario
          </Badge>
        </p>
      ) : null}
      <HistoryBadge events={snapshot.events} historyHash={snapshot.payment?.historyHash ?? null} example={snapshot.example} />
      <ProgressStepper state={deal.state} events={snapshot.events} />
    </div>
  );
}
