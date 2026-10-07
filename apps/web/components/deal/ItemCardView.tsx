"use client";

import { CONDITION_LABELS, type ItemCard } from "@pay-pals/contracts";
import { useState } from "react";
import { boxSerialLabel, boxSerialMatches } from "@/lib/deal/box-serial";
import { diffCards } from "@/lib/deal/card-diff";
import { formatMoney, formatTime } from "@/lib/format";
import { PhotoGrid } from "../photos/PhotoGrid";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";

interface Props {
  cards: ItemCard[];
  currentVersion: number;
  lockedVersion: number | null;
}

/** The item card. Shows every version until the lock, then only the locked one. */
export function ItemCardView({ cards, currentVersion, lockedVersion }: Props) {
  const [selected, setSelected] = useState<number>(lockedVersion ?? currentVersion);
  const shown = lockedVersion ?? selected;
  const card = cards.find((c) => c.version === shown) ?? cards[cards.length - 1];
  if (!card) return null;
  const prev = cards.find((c) => c.version === card.version - 1);
  const changes = prev ? diffCards(prev, card) : [];
  const locked = lockedVersion !== null;

  return (
    <Panel
      title="Item card"
      aside={
        locked ? (
          <Badge tone="accent">Locked, version {lockedVersion}</Badge>
        ) : cards.length > 1 ? (
          <div role="tablist" aria-label="Card versions" className="flex gap-1">
            {cards.map((c) => (
              <button
                key={c.version}
                role="tab"
                aria-selected={c.version === shown}
                onClick={() => setSelected(c.version)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  c.version === shown ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-wash text-muted hover:bg-[var(--accent-soft)]"
                }`}
              >
                Version {c.version}
              </button>
            ))}
          </div>
        ) : (
          <Badge>Version 1, draft</Badge>
        )
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-ink">{card.title}</h3>
          <p className="text-sm text-muted">
            {card.brand} {card.model}
          </p>
        </div>
        <p className="text-2xl font-black text-[var(--accent-ink)]">{formatMoney(card.askingPrice, card.currency)}</p>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Serial</dt>
          <dd className={card.serial ? "font-mono" : "text-caution"}>{card.serial ?? "Not on the card"}</dd>
        </div>
        {card.boxSerial ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Box serial</dt>
            <dd>
              <span className="font-mono">{card.boxSerial}</span>{" "}
              <span className={`text-xs font-semibold ${boxSerialMatches(card) ? "text-go" : "text-stop"}`}>{boxSerialLabel(card)}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Condition</dt>
          <dd>{CONDITION_LABELS[card.conditionGrade]}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Condition notes</dt>
          <dd>{card.conditionNotes || "None"}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Included</dt>
          <dd>{card.included.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Paid to</dt>
          <dd className="break-all">{card.sellerPaypalEmail}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Photos ({card.photos.length})</p>
        <PhotoGrid photos={card.photos} />
      </div>

      {changes.length > 0 ? (
        <div className="mt-4 rounded-lg bg-wash p-3 text-xs text-muted">
          <p className="font-semibold">Changed from version {card.version - 1}</p>
          <ul className="mt-1 list-disc pl-4">
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {locked && card.lockedAt ? (
        <p className="mt-3 text-xs text-muted">Locked {formatTime(card.lockedAt)}. This version is the text of the PayPal order. Nothing on it can change.</p>
      ) : null}
    </Panel>
  );
}
