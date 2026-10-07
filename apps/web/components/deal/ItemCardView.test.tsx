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
    expect(screen.getByText(/Console Information screen shows the same serial/)).toBeInTheDocument();
    expect(screen.getByText(/Changed from version 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Locked/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Version 1" }));
    expect(screen.queryByText(/Console Information screen shows the same serial/)).not.toBeInTheDocument();
    expect(screen.getByText(`Photos (${v1.photos.length})`)).toBeInTheDocument();
  });

  it("shows the locked badge and hides the version switcher once locked", () => {
    render(<ItemCardView cards={cleanPs5.cards} currentVersion={2} lockedVersion={2} />);
    expect(screen.getByText("Locked, version 2")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing on it can change/)).toBeInTheDocument();
  });

  it("renders the serial, condition and payee from the card", () => {
    render(<ItemCardView cards={[v1]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getAllByText("AH912345678").length).toBeGreaterThan(0);
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText(v1.sellerPaypalEmail)).toBeInTheDocument();
  });

  it("shows the box serial and whether it matches the console", () => {
    render(<ItemCardView cards={[v1]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("Box serial")).toBeInTheDocument();
    expect(screen.getByText("matches the console")).toBeInTheDocument();
  });

  it("says when the box serial does not match", () => {
    render(<ItemCardView cards={[{ ...v1, boxSerial: "ZZ000000000" }]} currentVersion={1} lockedVersion={null} />);
    expect(screen.getByText("ZZ000000000")).toBeInTheDocument();
    expect(screen.getByText("does not match")).toBeInTheDocument();
  });

  it("shows the cert number and grade with the Buyer Pal's PSA result", () => {
    const slab = fakeSlab.cards[0]!;
    const certCheck: CertCheck = { record: fakeSlab.certRecord!, matches: false, explanation: "PSA's record for this cert is a different card and grade." };
    render(<ItemCardView cards={[slab]} currentVersion={1} lockedVersion={null} certCheck={certCheck} />);
    expect(screen.getByText("Cert number")).toBeInTheDocument();
    expect(screen.getByText(FAKE_SLAB_CERT)).toBeInTheDocument();
    expect(screen.getByText("Grade")).toBeInTheDocument();
    expect(screen.getByText("PSA 10")).toBeInTheDocument();
    expect(screen.getByText(/PSA record does not match: 2016 Pokemon XY Evolutions Charizard Holo #11, grade 7/)).toBeInTheDocument();
  });

  it("says when the PSA record matches", () => {
    const slab = fakeSlab.cards[0]!;
    const certCheck: CertCheck = { record: { ...fakeSlab.certRecord!, subject: slab.title, grade: "10" }, matches: true, explanation: "Matches." };
    render(<ItemCardView cards={[slab]} currentVersion={1} lockedVersion={null} certCheck={certCheck} />);
    expect(screen.getByText(/PSA record matches/)).toBeInTheDocument();
  });

  it("shows no box serial row when the card has none", () => {
    render(<ItemCardView cards={[{ ...v1, boxSerial: null }]} currentVersion={1} lockedVersion={null} />);
    expect(screen.queryByText("Box serial")).not.toBeInTheDocument();
  });
});
