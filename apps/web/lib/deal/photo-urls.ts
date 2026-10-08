/**
 * Photo URLs for the pals. Stored photos keep app-relative URLs such as
 * /fixtures/clean-ps5/console-back-serial.jpg so the pages keep working
 * wherever the app is hosted. A pal running on the server cannot fetch a
 * relative URL, so every pal call gets absolute URLs: resolved against
 * NEXT_PUBLIC_APP_URL when set, else the origin of the request being handled.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ItemCard, Message, Photo } from "@pay-pals/contracts";

const requestOrigin = new AsyncLocalStorage<string>();

/** Scheme and host of the request, honouring the proxy headers a host sets. */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

/** Run a handler with the request's origin available to the flows it calls. */
export function withRequestOrigin<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  return requestOrigin.run(originOf(req), fn);
}

export function photoBase(env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  return configured || requestOrigin.getStore() || null;
}

export function absoluteUrl(url: string, base: string | null = photoBase()): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || !base) return url;
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export function absolutePhotos(photos: readonly Photo[], base: string | null = photoBase()): Photo[] {
  return photos.map((p) => ({ ...p, url: absoluteUrl(p.url, base) }));
}

export function absoluteCard(card: ItemCard, base: string | null = photoBase()): ItemCard {
  return { ...card, photos: absolutePhotos(card.photos, base) };
}

export function absoluteMessages(messages: readonly Message[], base: string | null = photoBase()): Message[] {
  return messages.map((m) => (m.photos.length > 0 ? { ...m, photos: absolutePhotos(m.photos, base) } : m));
}
