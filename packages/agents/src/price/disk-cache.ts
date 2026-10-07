/**
 * A tiny JSON file cache keyed by request. Keeps Channel3 calls from
 * repeating in dev and tests. Lives in packages/agents/.cache, gitignored.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".cache", "channel3");

export interface DiskCache {
  get<T>(key: unknown): Promise<T | null>;
  set(key: unknown, value: unknown): Promise<void>;
}

function fileFor(dir: string, key: unknown): string {
  const hash = createHash("sha1").update(JSON.stringify(key)).digest("hex");
  return join(dir, `${hash}.json`);
}

export function createDiskCache(dir = DEFAULT_CACHE_DIR): DiskCache {
  return {
    async get<T>(key: unknown): Promise<T | null> {
      try {
        return JSON.parse(await readFile(fileFor(dir, key), "utf8")) as T;
      } catch {
        return null;
      }
    },
    async set(key: unknown, value: unknown): Promise<void> {
      await mkdir(dir, { recursive: true });
      await writeFile(fileFor(dir, key), JSON.stringify(value, null, 2), "utf8");
    },
  };
}

export const noCache: DiskCache = {
  async get() {
    return null;
  },
  async set() {},
};
