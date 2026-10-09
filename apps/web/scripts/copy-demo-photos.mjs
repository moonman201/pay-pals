// Copies the demo photos from assets/demo-photos (repo root) into public/fixtures
// so the fixture URLs /fixtures/<scenario>/<file> resolve. Runs before dev and
// build. Missing source files are fine: the app shows a placeholder for them.
//
// The scenario folders and the reference folder are copied with their shape
// kept. Only files a browser can show are copied: the originals Matt shot sit
// in the same tree as .HEIC, and the notes as .md, and neither belongs in
// public/. public/fixtures is gitignored, so this runs on every checkout.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** What a browser can show. Everything else in the tree is a source file, not a demo photo. */
export const WEB_IMAGE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

/**
 * Copies every web image under `source` into `target`, keeping the folder
 * shape. Returns what it did, so the caller can say so in one line.
 */
export function copyDemoPhotos(source, target) {
  const copied = [];
  const skipped = [];
  if (!existsSync(source)) return { copied, skipped, folders: [] };
  const folders = new Set();
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      const from = path.join(dir, name);
      const relative = rel ? path.join(rel, name) : name;
      if (statSync(from).isDirectory()) {
        walk(from, relative);
        continue;
      }
      if (!WEB_IMAGE.test(name)) {
        skipped.push(relative);
        continue;
      }
      const to = path.join(target, relative);
      mkdirSync(path.dirname(to), { recursive: true });
      cpSync(from, to);
      copied.push(relative);
      if (rel) folders.add(rel);
    }
  };
  walk(source, "");
  return { copied, skipped, folders: [...folders].sort() };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "..", "..", "..", "assets", "demo-photos");
const target = path.resolve(here, "..", "public", "fixtures");

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (!existsSync(source)) {
    mkdirSync(target, { recursive: true });
    console.info(`[pay-pals] demo photos: none at ${path.relative(process.cwd(), source)}, placeholders will show`);
  } else {
    // Start clean, so a photo deleted from the tree does not linger in public/.
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    const { copied, skipped, folders } = copyDemoPhotos(source, target);
    const where = folders.length > 0 ? ` across ${folders.join(", ")}` : "";
    console.info(`[pay-pals] demo photos: copied ${copied.length} images${where} into public/fixtures${skipped.length > 0 ? `, skipped ${skipped.length} non-image files` : ""}`);
  }
}
