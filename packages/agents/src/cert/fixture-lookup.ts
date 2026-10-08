/**
 * CertLookup backed by the scenario fixtures. Used in demos and tests so
 * PSA is never called. A fixture record stands in for a PSA answer (the pal
 * calls it a demo record). Any cert number the fixtures do not know was not
 * looked up anywhere, so the record says so: subject null and
 * raw.notChecked true. That is never a mismatch; the rule leaves it alone.
 */
import type { CertLookup, CertRecord } from "@pay-pals/contracts";
import { ALL_FIXTURES } from "@pay-pals/contracts";

export const NOT_CHECKED_REASON = "no PSA access on this server";

/** True when the record means "nobody looked this cert up", as opposed to a grader saying it does not exist. */
export function isNotChecked(record: CertRecord): boolean {
  if (record.provider === "psa") return false;
  return record.subject === null && (record.raw === null || record.raw.notChecked === true);
}

export function createFixtureCertLookup(): CertLookup {
  const known = new Map<string, CertRecord>();
  for (const fixture of ALL_FIXTURES) if (fixture.certRecord) known.set(fixture.certRecord.certNumber, fixture.certRecord);
  return {
    async lookup(certNumber: string): Promise<CertRecord> {
      const checkedAt = new Date().toISOString();
      const record = known.get(certNumber.trim());
      if (record) return { ...record, raw: record.raw ? { ...record.raw } : null, checkedAt };
      return {
        provider: "fixture",
        certNumber: certNumber.trim(),
        subject: null,
        grade: null,
        year: null,
        brand: null,
        raw: { notChecked: true, reason: NOT_CHECKED_REASON },
        checkedAt,
      };
    },
  };
}
