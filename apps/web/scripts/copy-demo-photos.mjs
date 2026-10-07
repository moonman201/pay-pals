// Copies the demo photos from assets/demo-photos (repo root) into public/fixtures
// so the fixture URLs /fixtures/<scenario>/<file> resolve. Runs before dev and
// build. Missing source files are fine: the app shows a placeholder for them.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, "..", "..", "..", "assets", "demo-photos");
const target = path.resolve(here, "..", "public", "fixtures");

function countFiles(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    n += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return n;
}

mkdirSync(target, { recursive: true });
if (!existsSync(source)) {
  console.info(`[pay-pals] demo photos: none at ${path.relative(process.cwd(), source)}, placeholders will show`);
} else {
  cpSync(source, target, { recursive: true });
  console.info(`[pay-pals] demo photos: copied ${countFiles(source)} files into public/fixtures`);
}
