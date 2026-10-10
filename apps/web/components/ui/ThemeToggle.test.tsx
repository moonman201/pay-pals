import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

const mode = () => document.documentElement.getAttribute(THEME_ATTRIBUTE);
const stored = () => window.localStorage.getItem(THEME_STORAGE_KEY);

/** jsdom has no device setting, so the test says what the device asks for. */
function device(dark: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: dark, media: "(prefers-color-scheme: dark)" })));
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    window.localStorage.clear();
    device(false);
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

  it("switches a device in day mode to night and keeps the choice", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("dark");
    expect(stored()).toBe("dark");
  });

  it("switches a device in night mode to day and keeps the choice", async () => {
    device(true);
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("light");
    expect(stored()).toBe("light");
  });

  it("switches back on a second press", async () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");
    await userEvent.click(button);
    await userEvent.click(button);
    expect(mode()).toBe("light");
    expect(stored()).toBe("light");
  });

  it("goes by what is on the page, not by the device, once a choice is on it", async () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "light");
    device(true);
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(mode()).toBe("dark");
  });

  it("is reachable and pressable from the keyboard", async () => {
    render(<ThemeToggle />);
    await userEvent.tab();
    expect(screen.getByTestId("theme-toggle")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(mode()).toBe("dark");
  });
});
