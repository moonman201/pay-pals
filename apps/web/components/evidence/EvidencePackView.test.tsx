import { chainEvents, emptyBox, type EvidencePack } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readOrderFields } from "@/lib/deal/paypal-confirmation";
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
    render(<EvidencePackView pack={pack({ lockedCard: { ...lockedCard, serial: lockedCard.boxSerial ?? null } })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("Box serial")).toBeInTheDocument();
    expect(screen.getAllByText(lockedCard.boxSerial!).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("(matches the console)")).toBeInTheDocument();
  });

  it("says when the box serial does not match", () => {
    render(<EvidencePackView pack={pack({ lockedCard: { ...lockedCard, serial: lockedCard.boxSerial ?? null, boxSerial: "ZZ000000000" } })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("ZZ000000000")).toBeInTheDocument();
    expect(screen.getByText("(does not match)")).toBeInTheDocument();
  });

  it("says nothing was read off the console when the locked card carries only the box label", () => {
    expect(lockedCard.serial).toBeNull();
    render(<EvidencePackView pack={pack()} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("(no serial read off the console yet)")).toBeInTheDocument();
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
    expect(screen.getByText(/No hash was recorded with an order for this deal/)).toBeInTheDocument();
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
    expect(badges[0]).toHaveTextContent(`Tamper-evident history, ${emptyBox.timeline.length} events`);
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
    render(<EvidencePackView pack={pack({ historyHash: head, historyVerified: true, payment: emptyBox.payment, historyAnchor: "not_anchored" })} deal={emptyBox.deal} role="buyer" read={{ kind: "example" }} />);
    // Said once, as the banner.
    expect(screen.getAllByText(/Example deal, seeded from a scenario/)).toHaveLength(1);
    expect(screen.getByTestId("example-banner")).toHaveTextContent("The payment ids are placeholders");
    expect(screen.getAllByTestId("history-badge")[0]).not.toHaveTextContent(/example/i);
    expect(screen.queryByText(/corroborated by PayPal/)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Order ${emptyBox.payment!.paypalOrderId}`))).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Confirmed by PayPal" })).not.toBeInTheDocument();
    expect(screen.getByTestId("history-anchor")).toHaveAttribute("data-anchor", "not_anchored");
    expect(screen.getByTestId("history-anchor")).toHaveTextContent("No PayPal order holds this hash.");
  });

  it("a real deal keeps the verified claim, and a live read earns the Confirmed by PayPal heading", () => {
    const head = emptyBox.timeline.find((e) => e.kind === "payment_created")!.hash;
    const realTimeline = emptyBox.timeline.map((e) => (e.kind === "deal_created" ? { ...e, data: undefined } : e));
    render(
      <EvidencePackView
        pack={pack({ historyHash: head, payment: realPayment, timeline: realTimeline, historyAnchor: "corroborated" })}
        deal={emptyBox.deal}
        role="buyer"
        read={{ kind: "confirmed", order: readOrderFields({ id: "2NW245573K1279237", status: "COMPLETED" }) }}
      />,
    );
    expect(screen.queryByText("Example deal, seeded from a scenario")).not.toBeInTheDocument();
    expect(screen.getByTestId("history-anchor")).toHaveAttribute("data-anchor", "corroborated");
    expect(screen.getByRole("heading", { name: "Confirmed by PayPal" })).toBeInTheDocument();
    expect(screen.getByText("2NW245573K1279237")).toBeInTheDocument();
  });

  it("carries the pal's reasons under its review and under its arrival check", () => {
    const reasoning = {
      checked: ["The arrival photos against the locked card."],
      found: ["No console in the photos."],
      couldNotVerify: ["What was in the box when it left the seller."],
      wouldChangeMyMind: ["A packing photo showing the console inside the box."],
    };
    const verdict = {
      dealId: emptyBox.deal.id,
      cardVersion: 1,
      overall: "go" as const,
      flags: [],
      priceCheck: null,
      questionsForSeller: [],
      palMessage: "Looks fine.",
      reasoning: { ...reasoning, couldNotVerify: ["Whether the seller owns the console."] },
      createdAt: "2026-10-08T00:00:00.000Z",
    };
    const arrivalCheck = {
      dealId: emptyBox.deal.id,
      cardVersion: 1,
      outcome: "mismatch" as const,
      mismatches: [{ field: "serial" as const, expected: "AJ164952580", observed: "no console in the photos", explanation: "The box arrived without the item." }],
      observed: { brand: null, model: null, serial: null },
      palMessage: "The console is not there.",
      reasoning,
      createdAt: "2026-10-08T00:00:00.000Z",
    };
    render(<EvidencePackView pack={pack({ verdicts: [verdict], arrivalCheck })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getAllByTestId("pal-reasons")).toHaveLength(2);
    expect(screen.getByText("Whether the seller owns the console.")).toBeInTheDocument();
    expect(screen.getByText("What was in the box when it left the seller.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "What I could not check" })).toHaveLength(2);
  });

  it("never claims a confirmation on a deal with no payment at all, which is two clicks from any agreed deal", () => {
    render(<EvidencePackView pack={pack({ payment: null })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.queryByRole("heading", { name: "Confirmed by PayPal" })).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmed by PayPal")).not.toBeInTheDocument();
    expect(screen.getByTestId("paypal-confirmation")).toHaveAttribute("data-confirmed", "false");
    expect(screen.getByRole("heading", { name: "No PayPal order yet" })).toBeInTheDocument();
    expect(screen.getByText("No PayPal order has been created for this deal.")).toBeInTheDocument();
    // Nothing of ours is dressed up as PayPal's either: there is no record to print.
    expect(screen.getByRole("heading", { name: "Recorded by Pay Pals" })).toBeInTheDocument();
  });

  it("says the same for a deal with no payment whatever read it is handed", () => {
    for (const read of [{ kind: "confirmed" as const, order: readOrderFields({ id: "X", status: "COMPLETED" }) }, { kind: "failed" as const }, { kind: "example" as const }]) {
      const { unmount } = render(<EvidencePackView pack={pack({ payment: null })} deal={emptyBox.deal} role="buyer" read={read} />);
      expect(screen.queryByText("Confirmed by PayPal"), read.kind).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "No PayPal order yet" }), read.kind).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the two halves labelled, and never claims a confirmation when no read is passed", () => {
    render(<EvidencePackView pack={pack()} deal={emptyBox.deal} role="buyer" />);
    expect(screen.queryByRole("heading", { name: "Confirmed by PayPal" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recorded by Pay Pals" })).toBeInTheDocument();
    expect(screen.getByText(/could not read this order back from PayPal/)).toBeInTheDocument();
  });

  it("shows the market line per review and never a zero range", () => {
    const zero = { marketLow: 0, marketHigh: 0, currency: "USD" as const, provider: "channel3" as const, sources: [], checkedAt: "2026-10-08T00:00:00.000Z" };
    const verdict = { dealId: emptyBox.deal.id, cardVersion: 1, overall: "go" as const, flags: [], priceCheck: zero, questionsForSeller: [], palMessage: "Looks fine.", createdAt: "2026-10-08T00:00:00.000Z" };
    render(<EvidencePackView pack={pack({ verdicts: [verdict] })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/No reliable market price found, via Channel3/)).toBeInTheDocument();
    expect(screen.queryByText(/\$0 to \$0/)).not.toBeInTheDocument();
  });

  it("lists what the Buyer Pal asked and never got, and the ship-time flags under the shipment", () => {
    render(
      <EvidencePackView
        pack={pack({ unansweredQuestions: ["Can you add a close-up of the serial on the back of the console?"], shipmentFlags: emptyBox.shipment!.flags })}
        deal={emptyBox.deal}
        role="buyer"
      />,
    );
    expect(screen.getByText("What the Buyer Pal asked and never got")).toBeInTheDocument();
    expect(within(screen.getByTestId("unanswered-questions")).getByText(/close-up of the serial/)).toBeInTheDocument();
    const flags = screen.getByTestId("shipment-flags");
    expect(within(flags).getByText("a packing photo the seller skipped")).toBeInTheDocument();
    expect(within(flags).getByText("caution")).toBeInTheDocument();
  });

  it("says plainly when nothing went unanswered, and falls back to the shipment's own flags", () => {
    render(<EvidencePackView pack={pack({ unansweredQuestions: [], shipment: emptyBox.shipment, shipmentFlags: undefined })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/Every question the Buyer Pal asked before payment was answered/)).toBeInTheDocument();
    expect(screen.getByTestId("shipment-flags")).toBeInTheDocument();
  });

  it("has no box serial row when the card has none", () => {
    render(<EvidencePackView pack={pack({ lockedCard: { ...lockedCard, boxSerial: null } })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.queryByText("Box serial")).not.toBeInTheDocument();
    expect(screen.getByText("Pay Pals evidence pack")).toBeInTheDocument();
  });

  it("counts the live timeline on the badge and names the pack's own count as what it was at build time", () => {
    // Building the pack is itself an event, so the deal has one more than the pack snapshot.
    const last = emptyBox.timeline[emptyBox.timeline.length - 1]!;
    const built = { ...last, id: "evidence-built", kind: "evidence_built" as const, summary: "Evidence pack built." };
    const live = chainEvents([...emptyBox.timeline, built].map(({ prevHash: _p, hash: _h, ...rest }) => rest));
    render(<EvidencePackView pack={pack({ historyHash: null, historyVerified: null })} deal={emptyBox.deal} role="buyer" events={live} />);
    for (const badge of screen.getAllByTestId("history-badge")) {
      expect(badge).toHaveTextContent(`${live.length} events`);
      expect(badge).not.toHaveTextContent(`${emptyBox.timeline.length} events`);
    }
  });

  it("says the pack's count as a build-time count, never as a second total", () => {
    const head = emptyBox.timeline.find((e) => e.kind === "payment_created")?.hash ?? null;
    render(<EvidencePackView pack={pack({ historyHash: head, historyVerified: true })} deal={emptyBox.deal} role="buyer" events={emptyBox.timeline} />);
    expect(screen.getByText(/events at the time the pack was built/)).toBeInTheDocument();
  });

  /*
    The buyer's own account of what went wrong. It lives on the state change
    that opened the issue and nowhere else: the chat message about it names
    the enum's label, not the words the buyer picked. A dispute reviewer reads
    this pack for exactly that, so it sits by the arrival check rather than at
    the bottom of a list of every event.
  */
  it("carries the reason the buyer gave, in their own words, near the arrival check", () => {
    const opened = emptyBox.timeline.find((e) => e.kind === "state_changed" && e.toState === "ISSUE")!;
    const said = "Issue opened: what arrived does not match the locked card. The box arrived empty.";
    const live = emptyBox.timeline.map((e) => (e.id === opened.id ? { ...e, summary: said } : e));
    render(<EvidencePackView pack={pack()} deal={emptyBox.deal} role="buyer" events={live} />);
    expect(screen.getByTestId("pack-issue-reason")).toHaveTextContent("The box arrived empty.");
    // Above the chat, not buried in the trailing list of events.
    const reason = screen.getByTestId("pack-issue-reason");
    const chat = screen.getByRole("heading", { name: "Chat" });
    expect(reason.compareDocumentPosition(chat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers no issue section on a deal where nobody opened one", () => {
    const noIssue = emptyBox.timeline.filter((e) => !(e.kind === "state_changed" && e.toState === "ISSUE"));
    render(<EvidencePackView pack={pack()} deal={emptyBox.deal} role="buyer" events={noIssue} />);
    expect(screen.queryByTestId("pack-issue-reason")).not.toBeInTheDocument();
  });
});
