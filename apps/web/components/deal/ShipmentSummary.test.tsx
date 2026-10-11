import { emptyBox } from "@pay-pals/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShipmentSummary } from "./ShipmentSummary";

const shipment = emptyBox.shipment!;

describe("ShipmentSummary", () => {
  it("shows the Buyer Pal's ship-time caution with the same chips as a verdict flag", () => {
    render(<ShipmentSummary shipment={shipment} />);
    const flags = screen.getByTestId("shipment-flags");
    expect(within(flags).getByText("Buyer Pal:")).toBeInTheDocument();
    expect(within(flags).getByText("caution")).toBeInTheDocument();
    expect(within(flags).getByText("a packing photo the seller skipped")).toBeInTheDocument();
    // Oct 11: the Lead shortened this fixture explanation from 22 words to 11, under
    // Matt's rule 2. The consequence it used to spell out is the flag card's job and
    // the evidence pack's. A corrected expectation, not a loosened one: it still
    // pins the pal's exact sentence, which is the sentence the room now shows.
    expect(flags).toHaveTextContent("Shipped with no photo of the item going into the box.");
  });

  it("shows nothing extra when the pal raised no flags", () => {
    render(<ShipmentSummary shipment={{ ...shipment, flags: [] }} />);
    expect(screen.queryByTestId("shipment-flags")).not.toBeInTheDocument();
    render(<ShipmentSummary shipment={{ ...shipment, flags: undefined }} />);
    expect(screen.queryByTestId("shipment-flags")).not.toBeInTheDocument();
  });
});
