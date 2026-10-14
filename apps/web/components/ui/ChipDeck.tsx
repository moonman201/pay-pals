"use client";

import { useId, useState, type ReactNode } from "react";

export interface DeckItem {
  id: string;
  /** What sits on the chip. Short: an icon and a few words. */
  chip: ReactNode;
  /** Classes for this chip's colour. The base shape, the 44 px height and the open ring come from the deck. */
  chipClass?: string;
  /** What one tap on the chip shows. Always in the page, hidden until opened, so nothing is lost from it. */
  detail: ReactNode;
  /** Passed to the chip button, for tests and for CSS. */
  testId?: string;
  data?: Record<string, string>;
}

/**
 * A row of chips where one tap opens the sentence behind a chip, in a single shared slot under the row.
 *
 * This is how a page says less up front without saying less in all: the row is the short version, and
 * every line that used to be a paragraph is still here, one tap away, with its chip as the handle.
 * Tapping the open chip closes it. Only one detail is open at a time, which keeps the slot a fixed
 * place to look.
 */
export function ChipDeck({ items, label, className = "", slotClassName = "", initialOpen = null }: { items: readonly DeckItem[]; label: string; className?: string; slotClassName?: string; initialOpen?: string | null }) {
  const [open, setOpen] = useState<string | null>(initialOpen);
  const base = useId();
  return (
    <div>
      <ul className={`flex list-none flex-wrap gap-2 p-0 ${className}`} aria-label={label}>
        {items.map((item) => {
          const isOpen = open === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${base}-${item.id}`}
                data-testid={item.testId}
                {...Object.fromEntries(Object.entries(item.data ?? {}).map(([k, v]) => [`data-${k}`, v]))}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-2 ${item.chipClass ?? "border-line bg-wash text-ink"} ${isOpen ? "ring-2 ring-[var(--accent)]" : ""}`}
              >
                {item.chip}
              </button>
            </li>
          );
        })}
      </ul>
      {items.map((item) => (
        <div key={item.id} id={`${base}-${item.id}`} hidden={open !== item.id} className={open === item.id ? slotClassName : ""} data-deck-detail={item.id}>
          {item.detail}
        </div>
      ))}
    </div>
  );
}
