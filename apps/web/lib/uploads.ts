/**
 * Whether photo uploads work on this host: public/uploads must be writable.
 * Hosted builds have a read-only filesystem, so the upload control is hidden
 * there instead of showing dev-only copy.
 */
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export function uploadsDir(cwd = process.cwd()): string {
  return path.join(cwd, "public", "uploads");
}

export function detectUploadsEnabled(cwd = process.cwd()): boolean {
  try {
    const dir = uploadsDir(cwd);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
