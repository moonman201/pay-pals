import { cleanPs5 } from "@pay-pals/contracts";
import { describe, expect, it } from "vitest";
import { boxSerialLabel, boxSerialMatches, boxSerialStatus } from "./box-serial";

describe("boxSerialStatus", () => {
  it("matches when the box label is the serial on the item, whatever the spacing and case", () => {
    expect(boxSerialStatus({ serial: "aj164952580", boxSerial: "AJ 164 952 580" })).toBe("match");
    expect(boxSerialMatches({ serial: "AJ164952580", boxSerial: "AJ164952580" })).toBe(true);
    expect(boxSerialLabel({ serial: "AJ164952580", boxSerial: "AJ164952580" })).toBe("matches the console");
  });

  it("is a mismatch only when both numbers are there and they differ", () => {
    expect(boxSerialStatus({ serial: "AJ164952580", boxSerial: "ZZ000000000" })).toBe("mismatch");
    expect(boxSerialLabel({ serial: "AJ164952580", boxSerial: "ZZ000000000" })).toBe("does not match");
  });

  it("says nothing was read rather than accusing a seller whose console serial is not on the card yet", () => {
    const first = cleanPs5.cards[0]!;
    expect(first.serial).toBeNull();
    expect(first.boxSerial).not.toBeNull();
    expect(boxSerialStatus(first)).toBe("unread");
    expect(boxSerialMatches(first)).toBe(false);
    expect(boxSerialLabel(first)).toBe("no serial read off the console yet");
  });

  it("has nothing to say without a box label", () => {
    expect(boxSerialStatus({ serial: "AJ164952580", boxSerial: null })).toBe("unread");
  });
});
