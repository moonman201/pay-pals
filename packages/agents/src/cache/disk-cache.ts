/**
 * A tiny JSON file cache keyed by request, with a time to live. Keeps the
 * Channel3 and PSA calls from repeating in dev and tests. Lives under
 * packages/agents/.cache/<name>, gitignored. Entries expire after a day by
 * default; production uses noCache so prices and records are always fresh.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CACHE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache");
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The on-disk folder for one provider's cache, for example cacheDir("channel3"). */
export function cacheDir(name: string): string {
  return join(CACHE_ROOT, name);
}

export interface DiskCache {
  get<T>(key: unknown): Promise<T | null>;
  set(key: unknown, value: unknown): Promise<void>;
}

export interface DiskCacheOptions {
  dir?: string;
  ttlMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

interface Entry {
  savedAt: number;
  value: unknown;
}

function fileFor(dir: string, key: unknown): string {
  const hash = createHash("sha1").update(JSON.stringify(key)).digest("hex");
  return join(dir, `${hash}.json`);
}

export function createDiskCache(options: DiskCacheOptions = {}): DiskCache {
  const dir = options.dir ?? cacheDir("channel3");
  const ttlMs = options.ttlMs ?? ONE_DAY_MS;
  const now = options.now ?? Date.now;
  return {
    async get<T>(key: unknown): Promise<T | null> {
      try {
        const entry = JSON.parse(await readFile(fileFor(dir, key), "utf8")) as Partial<Entry>;
        if (typeof entry.savedAt !== "number" || now() - entry.savedAt > ttlMs) return null;
        return entry.value as T;
      } catch {
        return null;
      }
    },
    async set(key: unknown, value: unknown): Promise<void> {
      await mkdir(dir, { recursive: true });
      const entry: Entry = { savedAt: now(), value };
      await writeFile(fileFor(dir, key), JSON.stringify(entry, null, 2), "utf8");
    },
  };
}

/** The cache for a provider: on disk for a day in dev, off in production. */
export function defaultCacheFor(name: string): DiskCache {
  return process.env.NODE_ENV === "production" ? noCache : createDiskCache({ dir: cacheDir(name) });
}

export const noCache: DiskCache = {
  async get() {
    return null;
  },
  async set() {},
};
