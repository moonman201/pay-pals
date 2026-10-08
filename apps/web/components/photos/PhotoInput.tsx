"use client";

import type { Photo } from "@pay-pals/contracts";
import { useState } from "react";
import { Button } from "../ui/Button";
import { PhotoFrame } from "./PhotoFrame";

interface Props {
  value: Photo[];
  onChange: (photos: Photo[]) => void;
  addedBy: Photo["addedBy"];
  /** Photos the demo scenario offers, each added with one click. */
  suggestions?: Photo[];
  label?: string;
  /** The server says uploads work here (a writable public/uploads). Off on read-only hosts: photos by URL only. */
  uploadsEnabled?: boolean;
}

/** Add photos by URL, by upload where the host allows it, or from the demo suggestions. Every photo needs a plain description. */
export function PhotoInput({ value, onChange, addedBy, suggestions = [], label = "Photos", uploadsEnabled = false }: Props) {
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const have = new Set(value.map((p) => p.url));
  const open = suggestions.filter((s) => !have.has(s.url));

  function add(photo: Photo) {
    if (have.has(photo.url)) return;
    onChange([...value, photo]);
  }

  function addFromFields() {
    if (!url.trim() || !desc.trim()) {
      setError("Give the photo a URL and say what it shows.");
      return;
    }
    add({ url: url.trim(), whatItShows: desc.trim(), addedBy, addedAt: new Date().toISOString() });
    setUrl("");
    setDesc("");
    setError(null);
  }

  async function upload(file: File) {
    if (!desc.trim()) {
      setError("Say what the photo shows before uploading it.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      add({ url: data.url, whatItShows: desc.trim(), addedBy, addedAt: new Date().toISOString() });
      setDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted">{value.length} added</span>
      </div>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((p) => (
            <li key={p.url} className="relative">
              <PhotoFrame photo={p} size="sm" />
              <button
                type="button"
                aria-label={`Remove photo: ${p.whatItShows}`}
                onClick={() => onChange(value.filter((v) => v.url !== p.url))}
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full border border-line bg-white text-xs leading-none text-muted"
              >
                x
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open.length > 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] p-3">
          <p className="mb-2 text-xs font-semibold text-[var(--accent-ink)]">Demo photos</p>
          <ul className="space-y-1">
            {open.map((s) => (
              <li key={s.url} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{s.whatItShows}</span>
                <Button variant="secondary" className="shrink-0 px-3 py-1" onClick={() => add(s)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="url"
          placeholder="Photo URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="What it shows"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        />
        <Button variant="secondary" onClick={addFromFields}>
          Add URL
        </Button>
      </div>
      {uploadsEnabled ? (
      <label className="block text-xs text-muted">
        Or upload a file{" "}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
          className="ml-1 text-xs"
        />
      </label>
      ) : null}
      {error ? <p className="text-xs text-stop">{error}</p> : null}
    </div>
  );
}
