/**
 * Deal ids are uuid columns. Postgres rejects a non-uuid string with an
 * error, so reads check first and answer "not found" instead.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
