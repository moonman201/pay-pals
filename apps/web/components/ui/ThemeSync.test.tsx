import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeSync } from "./ThemeSync";

const mode = () => document.documentElement.getAttribute(THEME_ATTRIBUTE);

describe("ThemeSync", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    window.localStorage.clear();
  });

  it("applies the stored choice on mount, which is the only path on an error shell", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSync />);
    expect(mode()).toBe("dark");
  });

  it("applies a stored day choice the same way", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeSync />);
    expect(mode()).toBe("light");
  });

  it("leaves the device in charge when no choice is stored", () => {
    render(<ThemeSync />);
    expect(mode()).toBeNull();
  });

  it("ignores a junk stored value rather than writing it onto the document", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "navy");
    render(<ThemeSync />);
    expect(mode()).toBeNull();
  });

  it("changes nothing where the boot script already ran", () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSync />);
    expect(mode()).toBe("dark");
  });

  it("draws nothing", () => {
    const { container } = render(<ThemeSync />);
    expect(container).toBeEmptyDOMElement();
  });
});
