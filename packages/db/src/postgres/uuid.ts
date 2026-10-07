/**
 * UUID helpers for the Postgres store.
 *
 * isUuid: deal ids are uuid columns and Postgres rejects a non-uuid string
 * with an error, so reads check first and answer "not found" instead.
 *
 * uuidv7: time-ordered ids for messages and timeline events. Rows written in
 * the same millisecond sort in insertion order when listed by (at, id),
 * without a sequence column the frozen schema does not have.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

let lastMs = 0;
let counter = 0;

export function uuidv7(now: number = Date.now()): string {
  if (now === lastMs) counter += 1;
  else {
    lastMs = now;
    counter = 0;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // 48-bit millisecond timestamp.
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  // Version 7 plus a 12-bit counter that orders ids within one millisecond.
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  // RFC 4122 variant.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
