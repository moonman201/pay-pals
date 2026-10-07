/**
 * Dev-only photo upload: writes the file under public/uploads and returns
 * its URL. Hosted builds have a read-only filesystem, so there it answers
 * with a plain message to paste a URL instead.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Keep photos under 8 MB." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPEG, PNG, WebP or HEIC photo." }, { status: 400 });

  const name = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Uploads work in local development only. Paste a photo URL instead." }, { status: 501 });
  }
  return NextResponse.json({ url: `/uploads/${name}` });
}
