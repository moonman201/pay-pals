import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyThemeMode,
  currentThemeMode,
  deviceThemeMode,
  isThemeMode,
  otherThemeMode,
  storeThemeMode,
  storedThemeMode,
  THEME_ATTRIBUTE,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

const view = (dark: boolean) => ({ matchMedia: vi.fn(() => ({ matches: dark })) }) as unknown as Window;
const blocked = {
  getItem: () => {
    throw new Error("storage is blocked");
  },
  setItem: () => {
    throw new Error("storage is blocked");
  },
};

describe("the colour mode", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    window.localStorage.clear();
  });

  it("knows the two modes and nothing else", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("navy")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(otherThemeMode("dark")).toBe("light");
    expect(otherThemeMode("light")).toBe("dark");
  });

  it("reads the device setting when nothing is stored", () => {
    expect(deviceThemeMode(view(true))).toBe("dark");
    expect(deviceThemeMode(view(false))).toBe("light");
    expect(currentThemeMode(document.documentElement, view(true))).toBe("dark");
    expect(currentThemeMode(document.documentElement, view(false))).toBe("light");
  });

  it("lets the attribute on the page beat the device", () => {
    applyThemeMode(document.documentElement, "light");
    expect(currentThemeMode(document.documentElement, view(true))).toBe("light");
    applyThemeMode(document.documentElement, "dark");
    expect(currentThemeMode(document.documentElement, view(false))).toBe("dark");
  });

  it("keeps a choice and reads it back", () => {
    storeThemeMode(window.localStorage, "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(storedThemeMode(window.localStorage)).toBe("light");
  });

  it("has no stored choice until one is made, and ignores a junk value", () => {
    expect(storedThemeMode(window.localStorage)).toBeNull();
    window.localStorage.setItem(THEME_STORAGE_KEY, "navy");
    expect(storedThemeMode(window.localStorage)).toBeNull();
  });

  it("carries on when storage is blocked, as it is in some private windows", () => {
    expect(storedThemeMode(blocked)).toBeNull();
    expect(() => storeThemeMode(blocked, "dark")).not.toThrow();
    expect(storedThemeMode(null)).toBeNull();
    expect(deviceThemeMode(null)).toBe("light");
  });

  it("boots from the same key and attribute the toggle writes, and swallows a storage error", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain(THEME_ATTRIBUTE);
    expect(THEME_BOOT_SCRIPT).toContain("catch(e){}");
    // It runs in the document, so it must not need a module, a bundler or a modern browser.
    expect(THEME_BOOT_SCRIPT).not.toMatch(/=>|const |let /);
  });
});
