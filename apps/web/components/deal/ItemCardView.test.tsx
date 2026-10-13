import { cleanPs5, FAKE_SLAB_CERT, fakeSlab, type CertCheck } from "@pay-pals/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ItemCardView } from "./ItemCardView";

const [v1, v2] = cleanPs5.cards;
if (!v1 || !v2) throw new Error("fixture needs two card versions");
const unlocked = [v1, { ...v2, lockedAt: null }];

describe("ItemCardView", () => {
  it("shows version history while the card is open and lets you look back", async () => {
    render(<ItemCardView cards={unlocked} currentVersion={2} lockedVersion={null} />);
    expect(screen.getByRole("tab", { name: "Version 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Version 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Changed from version 1/)).toBeInTheDocument();
    expect(screen.getAllByText(v2.serial!).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Version 1" }));
    expect(screen.getByText(`Photos (${v1.photos.length})`)).toBeInTheDocument();
    expect(screen.queryByText(/Changed from version 1/)).not.toBeInTheDocument();
  });

  it("shows the locked badge and hides the version switcher once locked", () => {
    render(<ItemCardView cards={cleanPs5.cards} currentVersion={2} lockedVersion={2} />);
    expect(screen.getByText("Locked, version 2")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing on it can change/)).toBeInTheDocument();
  });

  it("renders the serial, condition and payee from the card", () => {
    render(<ItemCardView cards={[v2]} currentVersion={2} lockedVersion={null} />);
    expect(screen.getAllByText(v2.serial!).length).toBeGreaterThan(0);
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText(v2.sellerPaypalEmail)).toBeInTheDocument();
  });

  it("says plainly when a card carries no serial of its own", () => {
    render(<ItemCardView cards={[v1]} currentVersion={1} lockedVersion={null} />);
    expect(v1.serial).toBeNull();
    expect(v1.boxSerial).toBeTruthy();
    // The box label says the console has a serial. It has not been read, which is
    // not the same claim as "this item has none".
    expect(screen.getByText("Not read yet")).toBeInTheDocument();
    expect(screen.queryByText("None printed on this card")).not.toBeInTheDocument();
  });

  it("says none printed only when the item has no serial and no box label", () => {
    render(<ItemCardView cards={[{ ...v1, serial: null, boxSerial: null }]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("None printed on this card")).toBeInTheDocument();
    expect(screen.queryByText("Not read yet")).not.toBeInTheDocument();
  });

  it("shows the box serial and whether it matches the console", () => {
    render(<ItemCardView cards={[{ ...v1, serial: v1.boxSerial ?? null }]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("Box serial")).toBeInTheDocument();
    expect(screen.getByText("matches the console")).toBeInTheDocument();
  });

  it("says when the box serial does not match", () => {
    render(<ItemCardView cards={[{ ...v1, serial: v1.boxSerial ?? null, boxSerial: "ZZ000000000" }]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("ZZ000000000")).toBeInTheDocument();
    expect(screen.getByText("does not match")).toBeInTheDocument();
  });

  it("does not accuse a seller when the box label is on the card but the console serial is not", () => {
    render(<ItemCardView cards={[v1]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("Box serial")).toBeInTheDocument();
    expect(screen.getByText("Not read yet")).toBeInTheDocument();
    expect(screen.queryByText("no serial read off the console yet")).not.toBeInTheDocument();
    expect(screen.queryByText("does not match")).not.toBeInTheDocument();
  });

  it("shows the cert number and grade with the Buyer Pal's PSA result", () => {
    const slab = fakeSlab.cards[0]!;
    const certCheck: CertCheck = { record: fakeSlab.certRecord!, matches: false, explanation: "PSA's record for this cert is a different card and grade." };
    render(<ItemCardView cards={[slab]} currentVersion={1} lockedVersion={null} certCheck={certCheck} />);
    expect(screen.getByText("Cert number")).toBeInTheDocument();
    expect(screen.getByText(FAKE_SLAB_CERT)).toBeInTheDocument();
    expect(screen.getByText("Grade")).toBeInTheDocument();
    expect(screen.getByText("PSA 10")).toBeInTheDocument();
    const record = fakeSlab.certRecord!;
    const line = screen.getByText(new RegExp(`Card says PSA 10\\. .*record says ${record.subject!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, grade ${record.grade}\\.`));
    expect(line.textContent?.match(/PSA 10/g)).toHaveLength(1);
  });

  it("says when the PSA record agrees, naming the grade once", () => {
    const slab = fakeSlab.cards[0]!;
    const certCheck: CertCheck = { record: { ...fakeSlab.certRecord!, provider: "psa", subject: slab.title, grade: "10" }, matches: true, explanation: "Matches." };
    render(<ItemCardView cards={[slab]} currentVersion={1} lockedVersion={null} certCheck={certCheck} />);
    expect(screen.getByText("PSA record agrees: PSA 10")).toBeInTheDocument();
  });

  it("shows no box serial row when the card has none", () => {
    render(<ItemCardView cards={[{ ...v1, boxSerial: null }]} currentVersion={1} lockedVersion={null} />);
    expect(screen.queryByText("Box serial")).not.toBeInTheDocument();
  });
});
