/**
 * Turns "this deal does not exist" into DealNotFoundError for every write
 * that references a deal, whether the id is malformed or simply unknown
 * (Postgres reports the latter as a foreign key violation, SQLSTATE 23503).
 */
import { DealNotFoundError } from "../errors";
import { isUuid } from "./uuid";

const FK_VIOLATION = "23503";

function sqlState(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { code?: unknown; cause?: unknown };
  if (typeof e.code === "string") return e.code;
  return sqlState(e.cause);
}

export async function forDeal<T>(dealId: string, run: () => Promise<T>): Promise<T> {
  if (!isUuid(dealId)) throw new DealNotFoundError(dealId);
  try {
    return await run();
  } catch (err) {
    if (sqlState(err) === FK_VIOLATION) throw new DealNotFoundError(dealId);
    throw err;
  }
}
