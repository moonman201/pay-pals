import type { ChecklistItem, Photo } from "@pay-pals/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postJson = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/client/api", () => ({ postJson: (...args: unknown[]) => (postJson as (...a: unknown[]) => unknown)(...args), dealApi: (id: string, action: string) => `/api/deals/${id}/${action}` }));

import { RequestStep } from "./RequestStep";
import { ShipStep } from "./ShipStep";

const photo = (whatItShows: string, url = "/p/a.jpg"): Photo => ({ url, whatItShows, addedBy: "seller", addedAt: "2026-10-11T00:00:00.000Z" });
const closeUp = photo("Close-up of the label on the back of the console. The number under the barcode is AJ164952580.", "/p/close.jpg");

beforeEach(() => postJson.mockClear());

describe("RequestStep, the seller's next photo", () => {
  it("offers the demo close-up as one tap and sends it with no typed reply", async () => {
    const done = vi.fn();
    render(<RequestStep dealId="d1" questions={["Can you send a close-up of the serial label on the console?"]} suggestions={[closeUp]} onDone={done} />);
    expect(screen.getByTestId("next-photo")).toHaveTextContent("Your Seller Pal's next step");
    await userEvent.click(screen.getByRole("button", { name: "Add this photo and send it" }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    const [url, body] = postJson.mock.calls[0] as unknown as [string, { sellerReply: string; photos: Photo[]; request: { field: string } }];
    expect(url).toBe("/api/deals/d1/card");
    expect(body.photos).toEqual([closeUp]);
    // Nothing the seller typed, so nothing to be copied into the card's condition notes.
    expect(body.sellerReply).toBe("");
    expect(body.request.field).toBe("photos");
  });

  it("says plainly when the demo has no photo for the ask, and offers no tap", () => {
    render(<RequestStep dealId="d1" questions={["Can you photograph the slab next to a handwritten note with your name and today's date?"]} suggestions={[closeUp]} onDone={() => {}} />);
    expect(screen.getByTestId("next-photo")).toHaveTextContent("The demo has no photo for this one");
    expect(screen.queryByRole("button", { name: "Add this photo and send it" })).not.toBeInTheDocument();
  });

  it("shows no next step when nothing the pal asked is about a photo", () => {
    render(<RequestStep dealId="d1" questions={["Will you take $400?"]} suggestions={[closeUp]} onDone={() => {}} />);
    expect(screen.queryByTestId("next-photo")).not.toBeInTheDocument();
  });
});

describe("ShipStep, the seller's next photo", () => {
  const checklist: ChecklistItem[] = [
    { id: "c1", label: "Photo of the console, controller and cables going into the box", required: true, done: false },
    { id: "c2", label: "Photo of the sealed box", required: true, done: false },
  ];
  const sealed = photo("The same box taped shut along the seam, no label on it yet.", "/p/sealed.jpg");

  it("asks for the first photo the checklist wants, and ticks it when the demo photo is added", async () => {
    render(<ShipStep dealId="d1" checklist={checklist} palMessage={null} demo={{ carrier: "USPS", trackingNumber: "1", photos: [sealed] }} onDone={() => {}} />);
    // c1 has no demo photo, so the seller is told to take it.
    expect(screen.getByTestId("next-photo")).toHaveTextContent("Photo of the console, controller and cables going into the box");
    expect(screen.getByTestId("next-photo")).toHaveTextContent("The demo has no photo for this one");
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    // With c1 ticked the next step is the sealed box, which the demo does have.
    await userEvent.click(screen.getByRole("button", { name: "Add this photo" }));
    expect(screen.getAllByRole("checkbox")[1]).toBeChecked();
    expect(screen.queryByTestId("next-photo")).not.toBeInTheDocument();
  });
});
