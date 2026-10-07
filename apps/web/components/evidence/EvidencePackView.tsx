import { CONDITION_LABELS, type Deal, type EvidencePack } from "@pay-pals/contracts";
import Link from "next/link";
import { boxSerialLabel, boxSerialMatches } from "@/lib/deal/box-serial";
import { formatMoney, formatTime } from "@/lib/format";
import { actorLabel, OVERALL_LABELS, STATE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/role";
import { PhotoGrid } from "../photos/PhotoGrid";
import { PrintButton } from "./PrintButton";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line pt-5">
      <h2 className="text-base font-bold text-navy">{title}</h2>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

/** The evidence pack, laid out plainly so it reads the same on screen and on paper. */
export function EvidencePackView({ pack, deal, role }: { pack: EvidencePack; deal: Deal; role: Role }) {
  const card = pack.lockedCard;
  const sellerPhotos = pack.photos.filter((p) => p.addedBy === "seller");
  const buyerPhotos = pack.photos.filter((p) => p.addedBy === "buyer");
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue">Pay Pals evidence pack</p>
          <h1 className="mt-1 text-2xl font-black text-navy">{card.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Deal {pack.dealId}. Built {formatTime(pack.builtAt)} by {actorLabel(pack.builtBy, deal)}. Deal state: {STATE_LABELS[deal.state]}.
          </p>
        </div>
        <div className="no-print flex gap-2">
          <Link href={`/deals/${deal.id}?as=${role}`} className="text-sm font-semibold text-navy underline-offset-2 hover:underline">
            Back to the deal
          </Link>
          <PrintButton />
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <Section title="Summary">
          {pack.summary.split("\n\n").map((p, i) => (
            <p key={i} className="mb-2 leading-relaxed">
              {p}
            </p>
          ))}
        </Section>

        <Section title={`Locked item card, version ${card.version}`}>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-muted">Brand and model</dt><dd>{card.brand} {card.model}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Serial</dt><dd className="font-mono">{card.serial ?? "not recorded"}</dd></div>
            {card.boxSerial ? (
              <div>
                <dt className="text-xs uppercase text-muted">Box serial</dt>
                <dd>
                  <span className="font-mono">{card.boxSerial}</span> <span className={boxSerialMatches(card) ? "text-go" : "text-stop"}>({boxSerialLabel(card)})</span>
                </dd>
              </div>
            ) : null}
            <div><dt className="text-xs uppercase text-muted">Condition</dt><dd>{CONDITION_LABELS[card.conditionGrade]}. {card.conditionNotes}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Included</dt><dd>{card.included.join(", ")}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Price</dt><dd>{formatMoney(card.askingPrice, card.currency)}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Payee</dt><dd>{card.sellerPaypalEmail}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Locked</dt><dd>{card.lockedAt ? formatTime(card.lockedAt) : "not recorded"}</dd></div>
          </dl>
        </Section>

        <Section title="Payment">
          {pack.payment ? (
            <p>
              {formatMoney(pack.payment.amount, pack.payment.currency)} to {pack.payment.payeeEmail} via {pack.payment.method === "venmo" ? "Venmo" : "PayPal"} Goods and Services. Order {pack.payment.paypalOrderId}
              {pack.payment.captureId ? `, capture ${pack.payment.captureId}` : ""}. Status {pack.payment.status}.{pack.payment.capturedAt ? ` Captured ${formatTime(pack.payment.capturedAt)}.` : ""}
            </p>
          ) : (
            <p>No payment was made.</p>
          )}
        </Section>

        <Section title="Shipment">
          {pack.shipment ? (
            <>
              <p>
                {pack.shipment.carrier}, tracking {pack.shipment.trackingNumber}. Shipped {formatTime(pack.shipment.shippedAt)}.{pack.shipment.deliveredAt ? ` Delivered ${formatTime(pack.shipment.deliveredAt)}.` : " Delivery not confirmed."}
              </p>
              <ul className="mt-2 list-disc pl-5">
                {pack.shipment.checklist.map((c) => (
                  <li key={c.id}>{c.done ? "Done" : "Not done"}: {c.label}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>No shipment on record.</p>
          )}
        </Section>

        <Section title="Buyer Pal review">
          {pack.verdicts.length === 0 ? <p>No review on record.</p> : null}
          {pack.verdicts.map((v, i) => (
            <div key={i} className="mb-3">
              <p className="font-semibold">Card version {v.cardVersion}: {OVERALL_LABELS[v.overall]}</p>
              <p>{v.palMessage}</p>
              {v.flags.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {v.flags.map((f, j) => (
                    <li key={j}>{f.severity}: {f.explanation} ({f.evidence})</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </Section>

        <Section title="Arrival check">
          {pack.arrivalCheck ? (
            <>
              <p>{pack.arrivalCheck.palMessage}</p>
              {pack.arrivalCheck.mismatches.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {pack.arrivalCheck.mismatches.map((m) => (
                    <li key={m.field}>{m.field}: card says {m.expected}, arrived {m.observed}. {m.explanation}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p>No arrival check on record.</p>
          )}
        </Section>

        <Section title={`Seller's photos (${sellerPhotos.length})`}>
          <p className="mb-2 text-xs text-muted">From the locked card and the packing step.</p>
          <PhotoGrid photos={sellerPhotos} empty="None." />
        </Section>

        <Section title={`Buyer's arrival photos (${buyerPhotos.length})`}>
          <p className="mb-2 text-xs text-muted">What the buyer photographed when the box arrived.</p>
          <PhotoGrid photos={buyerPhotos} empty="None." />
        </Section>

        <Section title="Shared chat">
          <ol className="space-y-1">
            {pack.messages.map((m) => (
              <li key={m.id}>
                <span className="text-muted">{formatTime(m.at)}</span> <span className="font-semibold">{actorLabel(m.author, deal)}:</span> {m.text}
                {m.photos.length > 0 ? <span className="text-muted"> [{m.photos.length} photo{m.photos.length === 1 ? "" : "s"}]</span> : null}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Timeline">
          <ol className="space-y-1">
            {pack.timeline.map((e) => (
              <li key={e.id}>
                <span className="text-muted">{formatTime(e.at)}</span> {e.summary} <span className="text-muted">({actorLabel(e.actor, deal)})</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </main>
  );
}
