/**
 * CertLookup backed by the scenario fixtures. Used in demos and tests so
 * PSA is never called. Any cert number the fixtures do not know gets a
 * not-found record, which the CERT_MISMATCH rule treats as a mismatch.
 */
import type { CertLookup, CertRecord } from "@pay-pals/contracts";
import { ALL_FIXTURES } from "@pay-pals/contracts";

export function createFixtureCertLookup(): CertLookup {
  const known = new Map<string, CertRecord>();
  for (const fixture of ALL_FIXTURES) if (fixture.certRecord) known.set(fixture.certRecord.certNumber, fixture.certRecord);
  return {
    async lookup(certNumber: string): Promise<CertRecord> {
      const checkedAt = new Date().toISOString();
      const record = known.get(certNumber.trim());
      if (record) return { ...record, raw: record.raw ? { ...record.raw } : null, checkedAt };
      return { provider: "fixture", certNumber: certNumber.trim(), subject: null, grade: null, year: null, brand: null, raw: null, checkedAt };
    },
  };
}
