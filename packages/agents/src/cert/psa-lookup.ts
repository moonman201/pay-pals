/**
 * CertLookup backed by PSA's public API. One call per cert, none when the
 * cache answers; not-found answers are cached too. Maps PSA's record to the
 * contract's CertRecord: subject is composed from year, brand, subject,
 * variety and card number so the comparison and the pal message read as one
 * line, and grade is PSA's CardGrade ("GEM MT 10").
 */
import type { CertLookup, CertRecord } from "@pay-pals/contracts";
import { defaultCacheFor, type DiskCache } from "../cache/disk-cache";
import { psaCertFields, psaGetByCertNumber, type FetchLike, type PsaResponse } from "./psa-api";

export interface PsaOptions {
  fetchImpl?: FetchLike;
  cache?: DiskCache;
}

interface CachedAnswer {
  body: PsaResponse | null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export function toCertRecord(certNumber: string, body: PsaResponse | null, checkedAt: string): CertRecord {
  const fields = psaCertFields(body);
  if (!fields) {
    return { provider: "psa", certNumber, subject: null, grade: null, year: null, brand: null, raw: body, checkedAt };
  }
  const year = text(fields.Year);
  const brand = text(fields.Brand);
  const cardNumber = text(fields.CardNumber);
  const subject = [year, brand, text(fields.Subject), text(fields.Variety), cardNumber ? `#${cardNumber}` : null].filter((p): p is string => p !== null).join(" ");
  return {
    provider: "psa",
    certNumber: text(fields.CertNumber) ?? certNumber,
    subject: subject.length > 0 ? subject : null,
    grade: text(fields.CardGrade) ?? text(fields.GradeDescription),
    year,
    brand,
    raw: body,
    checkedAt,
  };
}

export function createPsaCertLookup(token: string, options: PsaOptions = {}): CertLookup {
  const cache = options.cache ?? defaultCacheFor("psa");
  return {
    async lookup(certNumber: string): Promise<CertRecord> {
      const key = { provider: "psa", certNumber: certNumber.trim() };
      let answer = await cache.get<CachedAnswer>(key);
      if (!answer) {
        answer = { body: await psaGetByCertNumber(token, certNumber, options.fetchImpl) };
        await cache.set(key, answer);
      }
      return toCertRecord(certNumber.trim(), answer.body, new Date().toISOString());
    },
  };
}
