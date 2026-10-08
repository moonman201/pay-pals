import { emptyBox, type EvidencePack } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidencePackView, messageCounts, summaryParts } from "./EvidencePackView";

const firstCard = emptyBox.cards[0];
if (!firstCard) throw new Error("fixture needs a card");
const lockedCard: NonNullable<typeof firstCard> = firstCard;

/** A real-looking payment: the fixture one carries a FIXTURE- id, which marks an example deal. */
const realPayment = { ...emptyBox.payment!, paypalOrderId: "2NW245573K1279237", captureId: "9PC825472S929124S" };

function pack(overrides: Partial<EvidencePack> = {}): EvidencePack {
  return {
    dealId: emptyBox.deal.id,
    builtBy: "buyer_pal",
    builtAt: "2026-10-27T15:22:00.000Z",
    lockedCard,
    verdicts: [],
    arrivalCheck: null,
    messages: [],
    photos: lockedCard.photos,
    payment: realPayment,
    shipment: emptyBox.shipment,
    timeline: emptyBox.timeline,
    summary: "Summary.",
    ...overrides,
  };
}

describe("EvidencePackView", () => {
  it("lists the box serial on the locked card and says it matches the console", () => {
    render(<EvidencePackView pack={pack()} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("Box serial")).toBeInTheDocument();
    expect(screen.getAllByText("AJ204567113").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("(matches the console)")).toBeInTheDocument();
  });

  it("says when the box serial does not match", () => {
    render(<EvidencePackView pack={pack({ lockedCard: { ...lockedCard, boxSerial: "ZZ000000000" } })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("ZZ000000000")).toBeInTheDocument();
    expect(screen.getByText("(does not match)")).toBeInTheDocument();
  });

  it("shows the tamper-evident history: the custom_id form, the event count, and a verification computed from the stored events", () => {
    const head = emptyBox.timeline.find((e) => e.kind === "payment_created")!.hash;
    render(<EvidencePackView pack={pack({ historyHash: head, historyVerified: true })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("Tamper-evident history")).toBeInTheDocument();
    expect(screen.getByText(`${emptyBox.deal.id}#${head}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${emptyBox.timeline.length} events are stored`))).toBeInTheDocument();
    expect(screen.getByText(/Verified: the stored events reproduce this hash/)).toBeInTheDocument();
    expect(screen.getAllByTestId("history-badge")[0]).toHaveTextContent("History unchanged since PayPal order");
  });

  it("warns when the stored events do not reproduce the recorded hash, whatever the builder recorded, and says when no order existed", () => {
    const { unmount } = render(<EvidencePackView pack={pack({ historyHash: "b".repeat(64), historyVerified: true })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/Does not verify/)).toBeInTheDocument();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("History does not match the hash on the PayPal order");
    unmount();
    render(<EvidencePackView pack={pack({ historyHash: null, historyVerified: null })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/No PayPal order was created, so no history hash was recorded/)).toBeInTheDocument();
  });

  it("counts chat messages per channel and lists pal messages apart from the shared chat", () => {
    const at = "2026-10-27T15:00:00.000Z";
    const messages = [
      { id: "1", dealId: emptyBox.deal.id, channel: "deal" as const, author: "buyer" as const, text: "Hi", photos: [], at },
      { id: "2", dealId: emptyBox.deal.id, channel: "deal" as const, author: "seller" as const, text: "Hello", photos: [], at },
      { id: "3", dealId: emptyBox.deal.id, channel: "deal" as const, author: "buyer" as const, text: "Deal", photos: [], at },
      { id: "4", dealId: emptyBox.deal.id, channel: "deal" as const, author: "seller" as const, text: "Yes", photos: [], at },
      { id: "5", dealId: emptyBox.deal.id, channel: "buyer_pal" as const, author: "buyer_pal" as const, text: "Private to the buyer", photos: [], at },
      { id: "6", dealId: emptyBox.deal.id, channel: "seller_pal" as const, author: "seller_pal" as const, text: "Private to the seller", photos: [], at },
    ];
    render(<EvidencePackView pack={pack({ messages })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("4 shared chat messages, 2 pal messages")).toBeInTheDocument();
    expect(messageCounts(messages.slice(0, 1))).toBe("1 shared chat message, 0 pal messages");
    expect(screen.getByText("Pal messages")).toBeInTheDocument();
    expect(screen.getByText(/Private to the buyer/)).toBeInTheDocument();
  });

  it("shows the live hash chain badge at the top", () => {
    render(<EvidencePackView pack={pack({ historyHash: null })} deal={emptyBox.deal} role="buyer" />);
    const badges = screen.getAllByTestId("history-badge");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(badges[0]).toHaveTextContent(`History hash-chained, ${emptyBox.timeline.length} events`);
  });

  it("puts a dealId#hash token from the summary on its own breakable monospace line, so the page never scrolls sideways", () => {
    const token = `${emptyBox.deal.id}#${"c".repeat(64)}`;
    expect(token).toHaveLength(101);
    const summary = `The chain head recorded on the PayPal order was ${token}, written into custom_id.\n\nA second paragraph with no hash.`;
    render(<EvidencePackView pack={pack({ summary })} deal={emptyBox.deal} role="buyer" />);
    const hash = screen.getByTestId("summary-hash");
    expect(hash).toHaveTextContent(token);
    expect(hash.className).toMatch(/break-all/);
    expect(hash.className).toMatch(/font-mono/);
    expect(hash.className).toMatch(/block/);
    const paragraph = hash.closest("p");
    expect(paragraph?.className).toMatch(/break-words/);
    expect(paragraph).toHaveTextContent(/The chain head recorded on the PayPal order was/);
    expect(paragraph).toHaveTextContent(/written into custom_id\./);
    expect(summaryParts("plain words only")).toEqual([{ kind: "text", text: "plain words only" }]);
    expect(summaryParts(`a ${"d".repeat(64)} b`).map((p) => p.kind)).toEqual(["text", "hash", "text"]);
  });

  it("on a seeded example deal (fixture order id), labels it and never claims PayPal holds the hash", () => {
    const head = emptyBox.timeline.find((e) => e.kind === "payment_created")!.hash;
    render(<EvidencePackView pack={pack({ historyHash: head, historyVerified: true, payment: emptyBox.payment })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getAllByText("Example deal, seeded from a scenario").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("history-badge")[0]).toHaveTextContent(/example deal, no PayPal order/);
    expect(screen.queryByText(/PayPal's own record holds it/)).not.toBeInTheDocument();
    expect(screen.getByText(/Example order id FIXTURE-ORDER/)).toBeInTheDocument();
    expect(screen.getByText(/no PayPal order holds the head/)).toBeInTheDocument();
  });

  it("a real deal keeps the verified claim and the plain order label", () => {
    const head = emptyBox.timeline.find((e) => e.kind === "payment_created")!.hash;
    const realTimeline = emptyBox.timeline.map((e) => (e.kind === "deal_created" ? { ...e, data: undefined } : e));
    render(<EvidencePackView pack={pack({ historyHash: head, payment: realPayment, timeline: realTimeline })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.queryByText("Example deal, seeded from a scenario")).not.toBeInTheDocument();
    expect(screen.getByText(/PayPal's own record holds it/)).toBeInTheDocument();
    expect(screen.getByText(/Order 2NW245573K1279237/)).toBeInTheDocument();
  });

  it("shows the market line per review and never a zero range", () => {
    const zero = { marketLow: 0, marketHigh: 0, currency: "USD" as const, provider: "channel3" as const, sources: [], checkedAt: "2026-10-08T00:00:00.000Z" };
    const verdict = { dealId: emptyBox.deal.id, cardVersion: 1, overall: "go" as const, flags: [], priceCheck: zero, questionsForSeller: [], palMessage: "Looks fine.", createdAt: "2026-10-08T00:00:00.000Z" };
    render(<EvidencePackView pack={pack({ verdicts: [verdict] })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/No reliable market price found, via Channel3/)).toBeInTheDocument();
    expect(screen.queryByText(/\$0 to \$0/)).not.toBeInTheDocument();
  });

  it("has no box serial row when the card has none", () => {
    render(<EvidencePackView pack={pack({ lockedCard: { ...lockedCard, boxSerial: null } })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.queryByText("Box serial")).not.toBeInTheDocument();
    expect(screen.getByText("Pay Pals evidence pack")).toBeInTheDocument();
  });
});
