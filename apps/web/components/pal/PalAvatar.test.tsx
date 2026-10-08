import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PalAvatar } from "./PalAvatar";

describe("PalAvatar", () => {
  it("is decorative next to the pal's name and labelled when it stands alone", () => {
    const { container } = render(<PalAvatar pal="buyer" />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    render(<PalAvatar pal="seller" labelled />);
    expect(screen.getByRole("img", { name: "Seller Pal" })).toBeInTheDocument();
  });

  it("shows the side's own head with the side's ring colour", () => {
    const { container } = render(<PalAvatar pal="seller" size={48} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("seller-pal");
    expect(img.getAttribute("data-pal")).toBe("seller");
    expect(img.className).toContain("ring-[var(--seller)]");
    expect(img.style.width).toBe("48px");
  });
});
