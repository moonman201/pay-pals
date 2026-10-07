/** The one clock the app writes timestamps from. */
export function nowIso(): string {
  return new Date().toISOString();
}
