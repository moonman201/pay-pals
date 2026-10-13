/**
 * The inputs for the clean deal's card on the landing, read from the seeded deal itself.
 *
 * Verdict history, state and arrival check all come from the store, so the card cannot say something
 * the deal does not. With no seeded deal, or a store that will not answer, it falls back to the
 * fixture's own timeline and the card still shows the story.
 */
import { cleanPs5, type Deal, type ArrivalCheck, type Verdict } from "@pay-pals/contracts";
import { inputFromFixture, type PathInput } from "@/components/landing/happy-path";

export interface PathReader {
  getDeal(id: string): Promise<Deal | null>;
  listVerdicts(dealId: string): Promise<Verdict[]>;
  getArrivalCheck(dealId: string): Promise<ArrivalCheck | null>;
}

export async function cleanPathInput(store: PathReader, seededId: string | undefined): Promise<PathInput> {
  if (!seededId) return inputFromFixture(cleanPs5);
  try {
    const [deal, verdicts, arrival] = await Promise.all([store.getDeal(seededId), store.listVerdicts(seededId), store.getArrivalCheck(seededId)]);
    if (!deal || verdicts.length === 0) return inputFromFixture(cleanPs5);
    const ordered = [...verdicts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { overalls: ordered.map((v) => v.overall), state: deal.state, arrival: arrival?.outcome ?? null };
  } catch {
    return inputFromFixture(cleanPs5);
  }
}
