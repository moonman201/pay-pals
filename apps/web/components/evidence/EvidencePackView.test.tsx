import { emptyBox, type EvidencePack } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidencePackView } from "./EvidencePackView";

const firstCard = emptyBox.cards[0];
if (!firstCard) throw new Error("fixture needs a card");
const lockedCard: NonNullable<typeof firstCard> = firstCard;

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
    payment: emptyBox.payment,
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

  it("shows the tamper-evident history: the custom_id form, the event count, and the verification", () => {
    const head = "a".repeat(64);
    render(<EvidencePackView pack={pack({ historyHash: head, historyVerified: true })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText("Tamper-evident history")).toBeInTheDocument();
    expect(screen.getByText(`${emptyBox.deal.id}#${head}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${emptyBox.timeline.length} events are stored`))).toBeInTheDocument();
    expect(screen.getByText(/Verified: the stored events reproduce this hash/)).toBeInTheDocument();
  });

  it("says plainly when the stored events do not reproduce the recorded hash, and when no order existed", () => {
    const { unmount } = render(<EvidencePackView pack={pack({ historyHash: "b".repeat(64), historyVerified: false })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/Does not verify/)).toBeInTheDocument();
    unmount();
    render(<EvidencePackView pack={pack({ historyHash: null, historyVerified: null })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.getByText(/No PayPal order was created, so no history hash was recorded/)).toBeInTheDocument();
  });

  it("has no box serial row when the card has none", () => {
    render(<EvidencePackView pack={pack({ lockedCard: { ...lockedCard, boxSerial: null } })} deal={emptyBox.deal} role="buyer" />);
    expect(screen.queryByText("Box serial")).not.toBeInTheDocument();
    expect(screen.getByText("Pay Pals evidence pack")).toBeInTheDocument();
  });
});
