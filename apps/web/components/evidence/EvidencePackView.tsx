import { CONDITION_LABELS, type Deal, type DealEvent, type EvidencePack, type Message } from "@pay-pals/contracts";
import { boxSerialLabel, boxSerialStatus } from "@/lib/deal/box-serial";
import { historyStatus } from "@/lib/deal/history-status";
import { priceRangeLine, priceSourceNote } from "@/lib/deal/price-copy";
import { summariseSources } from "@/lib/deal/price-sources";
import { isExampleDeal } from "@/lib/deal/snapshot";
import type { PayPalReadResult } from "@/lib/deal/paypal-confirmation";
import { PayPalConfirmation } from "../deal/PayPalConfirmation";
import { FlagEvidence } from "../deal/FlagEvidence";
import { HistoryBadge } from "../deal/HistoryBadge";
import { EvidenceHeader } from "./EvidenceHeader";
import { RecordedPartHeading } from "./RecordedPartHeading";
import { PalAvatar } from "../pal/PalAvatar";
import { ShipmentFlags } from "../deal/ShipmentFlags";

/** A dealId#hash token (36 plus 64 characters) or a bare 64-hex hash, which no phone width can hold on one line. */
const HASH_TOKEN = /([0-9a-f-]{36}#[0-9a-f]{64}|\b[0-9a-f]{64}\b)/g;

export type SummaryPart = { kind: "text" | "hash"; text: string };

/** Splits a summary paragraph so a hash token can sit on its own monospace line. */
export function summaryParts(paragraph: string): SummaryPart[] {
  const parts: SummaryPart[] = [];
  let last = 0;
  for (const match of paragraph.matchAll(HASH_TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: paragraph.slice(last, start) });
    parts.push({ kind: "hash", text: match[0] });
    last = start + match[0].length;
  }
  if (last < paragraph.length) parts.push({ kind: "text", text: paragraph.slice(last) });
  return parts.length > 0 ? parts : [{ kind: "text", text: paragraph }];
}

/** "4 shared chat messages, 2 pal messages": counted per channel, never one lump. */
export function messageCounts(messages: readonly Message[]): string {
  const shared = messages.filter((m) => m.channel === "deal").length;
  const pal = messages.length - shared;
  const word = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${word(shared, "shared chat message", "shared chat messages")}, ${word(pal, "pal message", "pal messages")}`;
}
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

/**
 * The evidence pack, laid out plainly so it reads the same on screen and on
 * paper. `events` is the deal's timeline as it stands now, which runs on
 * past the pack: building the pack is itself an event. The badge and the
 * stepper read the live one, and the pack's own count is named as what it
 * was when the pack was built.
 */
export function EvidencePackView({
  pack,
  deal,
  role,
  events,
  read = { kind: "failed" },
}: {
  pack: EvidencePack;
  deal: Deal;
  role: Role;
  events?: readonly DealEvent[];
  /** The live GET order, done while the page rendered. Defaults to a failed read so no caller can claim a confirmation by accident. */
  read?: PayPalReadResult;
}) {
  const live = events ?? pack.timeline;
  const card = pack.lockedCard;
  const sellerPhotos = pack.photos.filter((p) => p.addedBy === "seller");
  const buyerPhotos = pack.photos.filter((p) => p.addedBy === "buyer");
  const example = isExampleDeal(live, pack.payment);
  const shipmentFlags = pack.shipmentFlags ?? pack.shipment?.flags ?? [];
  const unanswered = pack.unansweredQuestions ?? [];
  return (
    <main className={`theme-${role} mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0`}>
      <EvidenceHeader
        dealId={deal.id}
        role={role}
        title={card.title}
        meta={
          <>
            Deal {pack.dealId}. Built {formatTime(pack.builtAt)} by {actorLabel(pack.builtBy, deal)}. Deal state: {STATE_LABELS[deal.state]}.
          </>
        }
        badges={
          <>
            {example ? <span className="inline-flex items-center rounded-full border border-line bg-wash px-2.5 py-0.5 text-xs text-muted">Example deal, seeded from a scenario</span> : null}
            <HistoryBadge events={live} historyHash={pack.historyHash ?? null} example={example} />
          </>
        }
        state={deal.state}
        events={live}
        actions={<PrintButton />}
      />

      <div className="mt-6 space-y-6">
        <Section title="Summary">
          {pack.summary.split("\n\n").map((p, i) => (
            <p key={i} className="mb-2 break-words leading-relaxed">
              {summaryParts(p).map((part, j) =>
                part.kind === "hash" ? (
                  <span key={j} data-testid="summary-hash" className="my-1 block break-all font-mono text-xs">
                    {part.text}
                  </span>
                ) : (
                  <span key={j}>{part.text}</span>
                ),
              )}
            </p>
          ))}
        </Section>

        {pack.payment ? (
          <PayPalConfirmation read={read} payment={pack.payment} dealId={pack.dealId} events={live} fallbackFields={false} />
        ) : (
          <Section title="Confirmed by PayPal">
            <p>No payment was made, so there is no PayPal order to read back.</p>
          </Section>
        )}

        <RecordedPartHeading />

        <Section title={`Locked item card, version ${card.version}`}>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-xs uppercase text-muted">Brand and model</dt><dd>{card.brand} {card.model}</dd></div>
            <div><dt className="text-xs uppercase text-muted">Serial</dt><dd className="font-mono">{card.serial ?? "not recorded"}</dd></div>
            {card.certNumber ? <div><dt className="text-xs uppercase text-muted">Cert number</dt><dd className="font-mono">{card.certNumber}{card.grade ? ` (${card.grade})` : ""}</dd></div> : null}
            {card.boxSerial ? (
              <div>
                <dt className="text-xs uppercase text-muted">Box serial</dt>
                <dd>
                  <span className="font-mono">{card.boxSerial}</span> <span className={boxSerialStatus(card) === "match" ? "text-go" : boxSerialStatus(card) === "mismatch" ? "text-stop" : "text-muted"}>({boxSerialLabel(card)})</span>
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

        <Section title="Tamper-evident history">
          <div className="mb-3">
            <HistoryBadge events={live} historyHash={pack.historyHash ?? null} example={example} />
          </div>
          {example ? (
            <p>
              This is an example deal seeded from a scenario. Its {live.length} events are hash-chained, so an edit would break the chain, but no PayPal order holds the head:
              the payment ids are placeholders. A real deal writes the head into the PayPal order&apos;s custom_id. The pack was built from {pack.timeline.length} events at the
              time the pack was built.
            </p>
          ) : pack.historyHash ? (
            <>
              <p>
                When the PayPal order was created, the head of this deal&apos;s event chain was written into the order&apos;s custom_id, so PayPal&apos;s own record holds it:
              </p>
              <p className="mt-1 break-all font-mono text-xs">
                {pack.dealId}#{pack.historyHash}
              </p>
              <p className="mt-2">
                {live.length} events are stored, {pack.timeline.length} events at the time the pack was built.{" "}
                {historyStatus(live, pack.historyHash).kind === "verified" ? (
                  <span className="font-semibold text-go">Verified: the stored events reproduce this hash.</span>
                ) : (
                  <span className="font-semibold text-stop">Does not verify: the stored events do not reproduce this hash.</span>
                )}
                {pack.historyVerified !== null && pack.historyVerified !== undefined ? (
                  <span className="text-muted"> (Checked again now; the builder recorded {pack.historyVerified ? "verified" : "not verified"} when the pack was built.)</span>
                ) : null}
              </p>
            </>
          ) : (
            <p>No PayPal order was created, so no history hash was recorded with PayPal. Each stored event still carries the hash of the one before it.</p>
          )}
        </Section>

        <Section title="Payment">
          {pack.payment ? (
            <p>
              As Pay Pals recorded it: {formatMoney(pack.payment.amount, pack.payment.currency)} to {pack.payment.payeeEmail} via{" "}
              {pack.payment.method === "venmo" ? "Venmo" : "PayPal"} Goods and Services. {example ? "Example order id" : "Order"} {pack.payment.paypalOrderId}
              {pack.payment.captureId ? `, capture ${pack.payment.captureId}` : ""}. Status {pack.payment.status}.
              {pack.payment.capturedAt ? ` Captured ${formatTime(pack.payment.capturedAt)}.` : ""}
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
              {shipmentFlags.length > 0 ? <ShipmentFlags flags={shipmentFlags} /> : null}
            </>
          ) : (
            <p>No shipment on record.</p>
          )}
        </Section>

        <Section title="What the Buyer Pal asked and never got">
          {unanswered.length > 0 ? (
            <ul className="list-disc pl-5" data-testid="unanswered-questions">
              {unanswered.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          ) : (
            <p>Nothing. Every question the Buyer Pal asked before payment was answered.</p>
          )}
        </Section>

        <Section title="Buyer Pal review">
          {pack.verdicts.length === 0 ? <p>No review on record.</p> : null}
          {pack.verdicts.map((v, i) => (
            <div key={i} className="mb-3 flex gap-3">
              <PalAvatar pal="buyer" size={28} className="mt-0.5" />
              <div className="min-w-0">
              <p className="font-semibold">Card version {v.cardVersion}: {OVERALL_LABELS[v.overall]}</p>
              <p className="text-xs text-muted">
                {priceRangeLine(v.priceCheck)}, {priceSourceNote(v.priceCheck)}
                {summariseSources(v.priceCheck) ? `. ${summariseSources(v.priceCheck)!.line}` : ""}
              </p>
              <p>{v.palMessage}</p>
              {v.flags.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {v.flags.map((f, j) => (
                    <li key={j}>
                      {f.severity}: {f.explanation}
                      <FlagEvidence evidence={f.evidence} always />
                    </li>
                  ))}
                </ul>
              ) : null}
              </div>
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

        <Section title="Chat">
          <p className="mb-2 text-xs text-muted">{messageCounts(pack.messages)}</p>
          <ol className="space-y-1">
            {pack.messages.filter((m) => m.channel === "deal").map((m) => (
              <li key={m.id}>
                <span className="text-muted">{formatTime(m.at)}</span> <span className="font-semibold">{actorLabel(m.author, deal)}:</span> {m.text}
                {m.photos.length > 0 ? <span className="text-muted"> [{m.photos.length} photo{m.photos.length === 1 ? "" : "s"}]</span> : null}
              </li>
            ))}
          </ol>
        </Section>

        {pack.messages.some((m) => m.channel !== "deal") ? (
          <Section title="Pal messages">
            <p className="mb-2 text-xs text-muted">Private to each side at the time. Included so a reviewer sees what each pal said.</p>
            <ol className="space-y-1">
              {pack.messages.filter((m) => m.channel !== "deal").map((m) => (
                <li key={m.id}>
                  <span className="text-muted">{formatTime(m.at)}</span> <span className="font-semibold">{actorLabel(m.author, deal)}:</span> {m.text}
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        <Section title="Timeline">
          <ol className="space-y-1">
            {pack.timeline.map((e) => (
              <li key={e.id}>
                <span className="text-muted">{formatTime(e.at)}</span> {e.summary} <span className="text-muted">({actorLabel(e.actor, deal)})</span>
                {e.hash ? <span className="ml-1 font-mono text-[10px] text-muted">#{e.hash.slice(0, 8)}</span> : null}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </main>
  );
}
