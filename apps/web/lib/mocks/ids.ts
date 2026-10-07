/** Id helper for the in-memory mocks. */
export function newId(): string {
  return crypto.randomUUID();
}
