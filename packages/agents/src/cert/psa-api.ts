/**
 * The raw PSA public API call: GET /publicapi/cert/GetByCertNumber/{cert}
 * with an "authorization: bearer <token>" header. PSA answers an unknown
 * cert with HTTP 200 and { IsValidRequest: true, ServerMessage: "No data
 * found" } (per its documentation) or with a 404; both read as not found.
 * Only the fields we use are typed; the whole body is kept as raw.
 */

export const PSA_BASE_URL = "https://api.psacard.com/publicapi";

export interface PsaCertFields {
  CertNumber?: string | number | null;
  Subject?: string | null;
  CardGrade?: string | null;
  GradeDescription?: string | null;
  Year?: string | number | null;
  Brand?: string | null;
  Category?: string | null;
  CardNumber?: string | null;
  Variety?: string | null;
  LabelType?: string | null;
  TotalPopulation?: number | null;
  [key: string]: unknown;
}

export interface PsaResponse {
  PSACert?: PsaCertFields | null;
  IsValidRequest?: boolean;
  ServerMessage?: string;
  [key: string]: unknown;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PsaError extends Error {
  constructor(
    public readonly status: number,
    detail: string,
  ) {
    super(`PSA cert lookup failed with ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "PsaError";
  }
}

let liveCalls = 0;

/** How many live PSA calls this process has made. */
export function psaCallCount(): number {
  return liveCalls;
}

/** The cert fields from a PSA body, whether wrapped in PSACert or flat. Null when PSA has no record. */
export function psaCertFields(body: PsaResponse | null): PsaCertFields | null {
  if (!body) return null;
  const fields = body.PSACert ?? (typeof body.CertNumber !== "undefined" ? (body as PsaCertFields) : null);
  if (!fields || fields.CertNumber === null || fields.CertNumber === undefined || String(fields.CertNumber).trim() === "") return null;
  return fields;
}

/** Fetches a cert. Resolves null when PSA has no record; throws PsaError on any other failure. */
export async function psaGetByCertNumber(token: string, certNumber: string, fetchImpl: FetchLike = fetch): Promise<PsaResponse | null> {
  const response = await fetchImpl(`${PSA_BASE_URL}/cert/GetByCertNumber/${encodeURIComponent(certNumber.trim())}`, {
    method: "GET",
    headers: { accept: "application/json", authorization: `bearer ${token}` },
  });
  liveCalls += 1;
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new PsaError(response.status, detail.slice(0, 300));
  }
  const body = (await response.json()) as PsaResponse;
  if (process.env.PAY_PALS_DEBUG) {
    console.debug(`[pay-pals agents] PSA live call #${liveCalls}: cert=${certNumber} message=${body.ServerMessage ?? "none"} found=${psaCertFields(body) !== null}`);
  }
  return psaCertFields(body) ? body : null;
}
