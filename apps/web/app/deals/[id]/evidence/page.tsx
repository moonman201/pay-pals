import { notFound } from "next/navigation";
import { BuildEvidenceButton } from "@/components/evidence/BuildEvidenceButton";
import { EvidencePackView } from "@/components/evidence/EvidencePackView";
import { FlowError } from "@/lib/deal/errors";
import { loadSnapshot } from "@/lib/deal/snapshot";
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
    if (pack) return <EvidencePackView pack={pack} deal={snapshot.deal} role={role} />;
    return (
      <main className={`theme-${role} mx-auto max-w-lg px-4 py-20 text-center`}>
        <h1 className="text-2xl font-bold text-navy">No evidence pack yet</h1>
        <p className="mt-2 text-sm text-muted">
          {snapshot.lockedCard ? "Either pal can build one from the locked card, chat, photos, payment, tracking and timeline." : "An evidence pack needs a locked card. This deal never got that far."}
        </p>
        {snapshot.lockedCard ? <BuildEvidenceButton dealId={id} role={role} /> : null}
      </main>
    );
  } catch (e) {
    if (e instanceof FlowError && e.status === 404) notFound();
    throw e;
  }
}
