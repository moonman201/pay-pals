import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToPanel } from "./scroll";

function setup(reduced: boolean) {
  document.body.innerHTML = '<section id="live-review"></section>';
  const el = document.getElementById("live-review")!;
  el.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as unknown as typeof window.matchMedia;
  return el;
}

describe("scrollToPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls smoothly by default", () => {
    const el = setup(false);
    scrollToPanel("live-review");
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("jumps without animation when the visitor asked for reduced motion", () => {
    const el = setup(true);
    scrollToPanel("live-review");
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("does nothing when the panel is not there", () => {
    document.body.innerHTML = "";
    expect(() => scrollToPanel("live-review")).not.toThrow();
  });
});
