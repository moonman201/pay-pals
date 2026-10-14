"use client";

import { CONDITION_LABELS, type ItemCard } from "@pay-pals/contracts";
import { useEffect, useState } from "react";
import { openFold } from "@/lib/client/open-fold";
import { formatMoney } from "@/lib/format";
import { BoxIcon, LockIcon } from "../ui/icons";

/** The item's first photo, or a quiet box when the file will not load. The photo's description stays on the item card. */
function GlancePhoto({ card }: { card: ItemCard }) {
  const photo = card.photos[0];
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!photo) return;
    let alive = true;
    const probe = new Image();
    probe.onload = () => alive && setOk(true);
    probe.onerror = () => alive && setOk(false);
    probe.src = photo.url;
    return () => {
      alive = false;
    };
  }, [photo]);
  if (photo && ok) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo.url} alt={photo.whatItShows} className="h-36 w-full rounded-xl border border-line object-cover md:h-48" />;
  }
  return (
    <div role="img" aria-label={photo?.whatItShows ?? "No photo yet"} data-testid="photo-placeholder" className="flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-line bg-wash text-muted md:h-48">
      <BoxIcon size={40} />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-wash px-2.5 py-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="truncate text-sm font-bold text-ink">{children}</dd>
    </div>
  );
}

/**
 * The item in one compact card: photo, price and the two facts a buyer matches on. Everything else
 * on the card, the full title, condition notes, every photo, the version history and the text of the
 * PayPal order, is in the Item card section under it.
 *
 * Once the card is locked the line "On the PayPal order" stays on this card, and it opens the order text.
 */
export function ItemGlance({ card, lockedVersion }: { card: ItemCard; lockedVersion: number | null }) {
  const locked = lockedVersion !== null;
  const id = card.certNumber ? { label: "Cert", value: card.certNumber } : { label: "Serial", value: card.serial ?? (card.boxSerial ? "Not read" : "None") };
  const second = card.grade ? { label: "Grade", value: card.grade } : { label: "Condition", value: CONDITION_LABELS[card.conditionGrade] };
  return (
    <section aria-label="The item" className={`rounded-2xl border border-line bg-surface p-3 shadow-card ${locked ? "ring-2 ring-[var(--accent)]" : ""}`} data-testid="item-glance">
      <GlancePhoto card={card} />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-3xl font-black leading-none tracking-tight text-[var(--accent-ink)]" data-testid="glance-price">
          {card.currency === "USD" ? "$" + card.askingPrice.toFixed(2) : formatMoney(card.askingPrice, card.currency)}
        </p>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)]" data-testid="glance-version">
          {locked ? <LockIcon size={13} strokeWidth={2.5} /> : null}
          {locked ? <span title={`Locked, version ${lockedVersion}`}>v{lockedVersion}<span className="sr-only"> locked</span></span> : `Draft v${card.version}`}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Fact label={id.label}>
          <span className="font-mono">{id.value}</span>
        </Fact>
        <Fact label={second.label}>{second.value}</Fact>
      </dl>
      {locked ? (
        <button
          type="button"
          onClick={() => openFold("item-card")}
          className="mt-2 inline-flex min-h-11 w-full items-center gap-1.5 rounded-lg border border-dashed border-[var(--accent-line)] px-2.5 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]"
          data-testid="glance-order-line"
        >
          <LockIcon size={14} />
          On the PayPal order
        </button>
      ) : null}
    </section>
  );
}
