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
    expect(flags).toHaveTextContent(/shipped without the photo of the item going into the box/);
  });

  it("shows nothing extra when the pal raised no flags", () => {
    render(<ShipmentSummary shipment={{ ...shipment, flags: [] }} />);
    expect(screen.queryByTestId("shipment-flags")).not.toBeInTheDocument();
    render(<ShipmentSummary shipment={{ ...shipment, flags: undefined }} />);
    expect(screen.queryByTestId("shipment-flags")).not.toBeInTheDocument();
  });
});
