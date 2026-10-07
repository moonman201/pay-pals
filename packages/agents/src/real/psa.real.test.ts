/**
 * Real PSA call. Skipped unless PSA_API_TOKEN is set (in the environment or
 * in .env.local at the repo root) and SKIP_REAL_TESTS is not. Looks up the
 * fixture cert and, when PSA_REAL_CERT is set, a second cert number Matt
 * supplies. Answers are cached in packages/agents/.cache/psa for a day.
 */
import { describe, expect, it } from "vitest";
import { CertRecordSchema, FAKE_SLAB_CERT } from "@pay-pals/contracts";
import { psaCallCount } from "../cert/psa-api";
import { createPsaCertLookup } from "../cert/psa-lookup";
import { hasKey } from "../testing/env";

const enabled = hasKey("PSA_API_TOKEN");
const certs = [FAKE_SLAB_CERT, ...(process.env.PSA_REAL_CERT ? [process.env.PSA_REAL_CERT] : [])];

describe.skipIf(!enabled)("real PSA (needs PSA_API_TOKEN)", () => {
  for (const cert of certs) {
    it(`looks up cert ${cert}`, async () => {
      const before = psaCallCount();
      const lookup = createPsaCertLookup(process.env.PSA_API_TOKEN!);
      const record = await lookup.lookup(cert);
      console.log(`PSA cert ${cert}: ${record.subject ? `${record.subject}, grade ${record.grade}` : "no record"} (${psaCallCount() - before} live call, 0 means cached)`);
      expect(CertRecordSchema.safeParse(record).success).toBe(true);
      expect(record.provider).toBe("psa");
      expect(record.certNumber).toBe(cert);
    }, 30_000);
  }
});
