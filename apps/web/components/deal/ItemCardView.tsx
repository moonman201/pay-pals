"use client";

import { CONDITION_LABELS, type CertCheck, type ItemCard } from "@pay-pals/contracts";
import { useState } from "react";
import { boxSerialLabel, boxSerialMatches } from "@/lib/deal/box-serial";
import { certSentence, type CertTone } from "@/lib/deal/cert-copy";
import { diffCards } from "@/lib/deal/card-diff";
import { formatMoney, formatTime } from "@/lib/format";
import { PhotoGrid } from "../photos/PhotoGrid";
import { Badge } from "../ui/Badge";
import { LockIcon } from "../ui/icons";
import { Panel } from "../ui/Panel";

interface Props {
  cards: ItemCard[];
  currentVersion: number;
  lockedVersion: number | null;
  /** The Buyer Pal's grader lookup for the card's cert number, when there is one. */
  certCheck?: CertCheck | null;
  /** The deal id, which the PayPal order carries as its invoice id. */
  dealId?: string | null;
}

const CERT_TONE: Record<CertTone, string> = { go: "text-go", stop: "text-stop", muted: "text-muted" };

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** The lines the PayPal order carries, laid out like a receipt so they read as the record they are. */
function OrderText({ card, dealId }: { card: ItemCard; dealId: string | null }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-[var(--accent-line)] bg-wash p-3 font-mono text-xs leading-relaxed" data-testid="order-text">
      <p className="mb-2 flex items-center gap-1.5 font-sans text-xs font-bold text-[var(--accent-ink)]">
        <LockIcon size={14} />
        On the PayPal order
      </p>
      <p>{card.title}</p>
      <p>
        Serial {card.serial ?? "not recorded"}. Condition: {CONDITION_LABELS[card.conditionGrade]}.
      </p>
      <p>
        {formatMoney(card.askingPrice, card.currency)} to {card.sellerPaypalEmail}, Goods and Services
      </p>
      {dealId ? <p className="text-muted">Invoice {dealId}</p> : null}
    </div>
  );
}

/** The item card. Shows every version until the lock, then only the locked one, styled as the fixed record it has become. */
export function ItemCardView({ cards, currentVersion, lockedVersion, certCheck = null, dealId = null }: Props) {
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
      className={locked ? "motion-lock ring-2 ring-[var(--accent)]" : ""}
      aside={
        locked ? (
          <Badge tone="accent" className="gap-1.5 py-1" data-testid="lock-badge">
            <LockIcon size={14} strokeWidth={2.5} />
            Locked, version {lockedVersion}
          </Badge>
        ) : cards.length > 1 ? (
          <div role="tablist" aria-label="Card versions" className="flex gap-1">
            {cards.map((c) => (
              <button
                key={c.version}
                role="tab"
                aria-selected={c.version === shown}
                onClick={() => setSelected(c.version)}
                className={`min-h-9 rounded-full px-3 text-xs font-semibold ${
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
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink">{card.title}</h3>
          <p className="text-sm text-muted">
            {card.brand} {card.model}
          </p>
        </div>
        <p className="text-2xl font-black text-[var(--accent-ink)]">{formatMoney(card.askingPrice, card.currency)}</p>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Field label="Serial">
          <span className={card.serial ? "font-mono" : "text-caution"}>{card.serial ?? "Not on the card"}</span>
        </Field>
        {card.certNumber ? (
          <Field label="Cert number" wide>
            <span className="font-mono">{card.certNumber}</span>
            {certCheck ? <span className={`ml-2 text-xs font-semibold ${CERT_TONE[certSentence(certCheck, card.grade).tone]}`}>{certSentence(certCheck, card.grade).text}</span> : null}
          </Field>
        ) : null}
        {card.grade ? <Field label="Grade">{card.grade}</Field> : null}
        {card.boxSerial ? (
          <Field label="Box serial">
            <span className="font-mono">{card.boxSerial}</span> <span className={`text-xs font-semibold ${boxSerialMatches(card) ? "text-go" : "text-stop"}`}>{boxSerialLabel(card)}</span>
          </Field>
        ) : null}
        <Field label="Condition">{CONDITION_LABELS[card.conditionGrade]}</Field>
        <Field label="Condition notes" wide>
          {card.conditionNotes || "None"}
        </Field>
        <Field label="Included">{card.included.join(", ")}</Field>
        <Field label="Paid to">
          <span className="break-all">{card.sellerPaypalEmail}</span>
        </Field>
      </dl>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted">Photos ({card.photos.length})</p>
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
      {locked ? (
        <>
          <OrderText card={card} dealId={dealId} />
          <p className="mt-2 text-xs text-muted">
            {card.lockedAt ? `Locked ${formatTime(card.lockedAt)}. ` : ""}This version is the text of the PayPal order. Nothing on it can change.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
