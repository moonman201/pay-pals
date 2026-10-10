import { notFound } from "next/navigation";
import { BuildEvidenceButton } from "@/components/evidence/BuildEvidenceButton";
import { EvidenceHeader } from "@/components/evidence/EvidenceHeader";
import { EvidencePackView } from "@/components/evidence/EvidencePackView";
import { FlowError } from "@/lib/deal/errors";
import { loadSnapshot } from "@/lib/deal/snapshot";
import { STATE_LABELS } from "@/lib/labels";
import { parseRole } from "@/lib/role";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EvidencePage({ params, searchParams }: Props) {
  const { id } = await params;
  const role = parseRole((await searchParams).as);
  const services = getServices();
  try {
    const snapshot = await loadSnapshot(services, id);
    const pack = await services.store.getEvidence(id);
    if (pack) return <EvidencePackView pack={pack} deal={snapshot.deal} role={role} events={snapshot.events} />;
    const locked = snapshot.lockedCard;
    return (
      <main className={`on-page theme-${role} mx-auto max-w-3xl px-4 py-8`}>
        <EvidenceHeader
          dealId={id}
          role={role}
          wordmark="Pay Pals"
          title="No evidence pack yet"
          meta={
            <>
              Deal {id}. Deal state: {STATE_LABELS[snapshot.deal.state]}.
            </>
          }
          state={snapshot.deal.state}
          events={snapshot.events}
        />
        <div className="mt-6 border-t border-line pt-6">
          <p className="max-w-[60ch] text-sm text-ink">
            {locked
              ? "Either pal can build one from the locked card, chat, photos, payment, tracking and timeline."
              : "An evidence pack needs a locked card. This deal never got that far."}
          </p>
          {locked ? <BuildEvidenceButton dealId={id} role={role} /> : null}
        </div>
      </main>
    );
  } catch (e) {
    if (e instanceof FlowError && e.status === 404) notFound();
    throw e;
  }
}
