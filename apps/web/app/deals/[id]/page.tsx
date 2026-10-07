import { notFound } from "next/navigation";
import { DealRoom } from "@/components/deal/DealRoom";
import { FlowError } from "@/lib/deal/errors";
import { loadSnapshot, snapshotForRole } from "@/lib/deal/snapshot";
import { parseRole } from "@/lib/role";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealPage({ params, searchParams }: Props) {
  const { id } = await params;
  const role = parseRole((await searchParams).as);
  try {
    const snapshot = await loadSnapshot(getServices(), id);
    return <DealRoom snapshot={snapshotForRole(snapshot, role)} role={role} />;
  } catch (e) {
    if (e instanceof FlowError && e.status === 404) notFound();
    throw e;
  }
}
