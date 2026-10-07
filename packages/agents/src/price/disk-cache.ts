/**
 * A tiny JSON file cache keyed by request, with a time to live. Keeps
 * Channel3 calls from repeating in dev and tests. Lives in
 * packages/agents/.cache, gitignored. Entries expire after a day by default;
 * production uses noCache so prices are always fresh.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache", "channel3");
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
  const dir = options.dir ?? DEFAULT_CACHE_DIR;
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

export const noCache: DiskCache = {
  async get() {
    return null;
  },
  async set() {},
};
