import { describe, expect, it } from "vitest";
import { CertRecordSchema, FAKE_SLAB_CERT } from "@pay-pals/contracts";
import type { DiskCache } from "../cache/disk-cache";
import { createFixtureCertLookup, isNotChecked } from "./fixture-lookup";
import { PsaError, psaCallCount } from "./psa-api";
import { createPsaCertLookup, toCertRecord } from "./psa-lookup";

const memoryCache = (): DiskCache => {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: unknown) {
      return (store.get(JSON.stringify(key)) as T) ?? null;
    },
    async set(key, value) {
      store.set(JSON.stringify(key), value);
    },
  };
};

const psaBody = {
  PSACert: {
    CertNumber: "12345678",
    SpecID: 1,
    LabelType: "with fugitive ink technology",
    Year: "2018",
    Brand: "P.M. JPN. SUN & MOON",
    Category: "TCG Cards",
    CardNumber: "038",
    Subject: "GENGAR & MIMIKYU GX TAG BOLT",
    Variety: "",
    GradeDescription: "GEM MT",
    CardGrade: "GEM MT 10",
    TotalPopulation: 100,
  },
  IsValidRequest: true,
  ServerMessage: "Request successful",
};

describe("toCertRecord", () => {
  it("maps a PSA record to the contract", () => {
    const record = toCertRecord("12345678", psaBody, new Date().toISOString());
    expect(CertRecordSchema.safeParse(record).success).toBe(true);
    expect(record).toMatchObject({ provider: "psa", certNumber: "12345678", subject: "2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038", grade: "GEM MT 10", year: "2018", brand: "P.M. JPN. SUN & MOON" });
    expect(record.raw).toEqual(psaBody);
  });
  it("maps no data to subject null", () => {
    const record = toCertRecord("1", { IsValidRequest: true, ServerMessage: "No data found" }, new Date().toISOString());
    expect(record.subject).toBeNull();
    expect(record.grade).toBeNull();
    expect(record.provider).toBe("psa");
  });
});

describe("createPsaCertLookup", () => {
  it("calls PSA with the bearer token once and serves repeats from the cache", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(psaBody), { status: 200, headers: { "content-type": "application/json" } });
    };
    const before = psaCallCount();
    const lookup = createPsaCertLookup("secret-token", { fetchImpl, cache: memoryCache() });
    const first = await lookup.lookup(" 12345678 ");
    const second = await lookup.lookup("12345678");
    expect(calls).toHaveLength(1);
    expect(psaCallCount() - before).toBe(1);
    expect(calls[0]!.url).toBe("https://api.psacard.com/publicapi/cert/GetByCertNumber/12345678");
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe("bearer secret-token");
    expect(first.subject).toBe("2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038");
    expect(second.subject).toBe(first.subject);
  });

  it("treats a 404 and a No data found body as not found, and caches that too", async () => {
    let status = 404;
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return status === 404 ? new Response("", { status: 404 }) : new Response(JSON.stringify({ IsValidRequest: true, ServerMessage: "No data found" }), { status: 200 });
    };
    const notFound = createPsaCertLookup("t", { fetchImpl, cache: memoryCache() });
    expect((await notFound.lookup("1")).subject).toBeNull();
    expect((await notFound.lookup("1")).subject).toBeNull();
    expect(calls).toHaveLength(1);
    status = 200;
    const noData = createPsaCertLookup("t", { fetchImpl, cache: memoryCache() });
    expect((await noData.lookup("2")).subject).toBeNull();
  });

  it("throws a PsaError with the status on other failures", async () => {
    const lookup = createPsaCertLookup("bad", { fetchImpl: async () => new Response("unauthorized", { status: 401 }), cache: memoryCache() });
    const error = await lookup.lookup("12345678").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PsaError);
    expect((error as PsaError).status).toBe(401);
  });
});

describe("createFixtureCertLookup", () => {
  it("answers the fixture cert and says not found otherwise", async () => {
    const lookup = createFixtureCertLookup();
    const known = await lookup.lookup(FAKE_SLAB_CERT);
    expect(known.subject).toBe("2018 P.M. JPN. SUN & MOON GENGAR & MIMIKYU GX TAG BOLT #038");
    expect(known.grade).toBe("GEM MT 10");
    const unknown = await lookup.lookup("49172834");
    expect(unknown).toMatchObject({ provider: "fixture", certNumber: "49172834", subject: null, grade: null, raw: { notChecked: true } });
    expect(isNotChecked(unknown)).toBe(true);
    expect(isNotChecked(known)).toBe(false);
    expect(CertRecordSchema.safeParse(unknown).success).toBe(true);
  });
});
