import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

const mode = () => document.documentElement.getAttribute(THEME_ATTRIBUTE);
const stored = () => window.localStorage.getItem(THEME_STORAGE_KEY);

describe("ThemeToggle", () => {
  beforeEach(() => {
    // Every real page carries the attribute, because layout.tsx renders it.
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "dark");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the mode it switches to, one half per mode, and CSS shows the right one", () => {
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector(".day-only")).toHaveTextContent("Night mode");
    expect(container.querySelector(".night-only")).toHaveTextContent("Day mode");
  });

  it("is a labelled button, keyboard reachable, 44 px, and left out of print", () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAccessibleName(/mode/i);
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
    expect(button.className).toContain("no-print");
  });

  it("switches the night default to day and keeps the choice", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("light");
    expect(stored()).toBe("light");
  });

  it("switches day back to night and keeps that too", async () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "light");
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("dark");
    expect(stored()).toBe("dark");
  });

  it("switches back on a second press", async () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");
    await userEvent.click(button);
    await userEvent.click(button);
    expect(mode()).toBe("dark");
    expect(stored()).toBe("dark");
  });

  it("goes by night on a page with no attribute, so Next's error shell agrees with the rest", async () => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("light");
  });

  it("never asks the device, not even on a page with no attribute at all", async () => {
    // G16: night is the default for everyone. A device set to light used to make this
    // press go the other way, so the guard is that the question is not asked.
    const matchMedia = vi.fn(() => ({ matches: false, media: "(prefers-color-scheme: dark)" }));
    vi.stubGlobal("matchMedia", matchMedia);
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("light");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("is reachable and pressable from the keyboard", async () => {
    render(<ThemeToggle />);
    await userEvent.tab();
    expect(screen.getByTestId("theme-toggle")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(mode()).toBe("light");
  });
});
