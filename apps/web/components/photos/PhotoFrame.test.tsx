import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoFrame } from "./PhotoFrame";

const photo = { url: "/fixtures/clean-ps5/console-back-serial.jpg", whatItShows: "Back of the console. Serial AH912345678 on the label.", addedBy: "seller" as const };

/** jsdom never loads images; drive the probe by hand. */
function stubImage(outcome: "load" | "error") {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => (outcome === "load" ? this.onload?.() : this.onerror?.()), 0);
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

afterEach(() => vi.unstubAllGlobals());

describe("PhotoFrame shows the caption once", () => {
  it("missing image: the placeholder carries the description and there is no second caption", async () => {
    stubImage("error");
    render(<PhotoFrame photo={photo} />);
    await waitFor(() => expect(screen.getByTestId("photo-placeholder")).toHaveAttribute("data-status", "failed"));
    expect(screen.getAllByText(photo.whatItShows)).toHaveLength(1);
    expect(document.querySelector("figcaption")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("loaded image: the image plus one caption, no placeholder", async () => {
    stubImage("load");
    render(<PhotoFrame photo={photo} />);
    await waitFor(() => expect(document.querySelector("img")).not.toBeNull());
    expect(screen.queryByTestId("photo-placeholder")).not.toBeInTheDocument();
    expect(document.querySelectorAll("figcaption")).toHaveLength(1);
    expect(screen.getAllByText(photo.whatItShows)).toHaveLength(1);
  });
});
