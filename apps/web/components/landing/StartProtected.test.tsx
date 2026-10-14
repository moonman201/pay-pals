import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StartProtected } from "./StartProtected";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("StartProtected", () => {
  it("is one button until it is pressed, then the form opens in place", () => {
    render(<StartProtected />);
    const button = screen.getByRole("button", { name: "Start a protected deal" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Seller's PayPal email")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Seller's PayPal email")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Use Pay Pals Protection" })).toBeInTheDocument();
  });

  it("keeps the explanation and the no-account line inside the form, behind How this works", () => {
    render(<StartProtected />);
    fireEvent.click(screen.getByRole("button", { name: "Start a protected deal" }));
    expect(document.body.textContent).toContain("No account needed. Nothing is charged until both sides agree to the item card.");
  });
});
