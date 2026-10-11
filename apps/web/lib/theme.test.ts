import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemeMode,
  currentThemeMode,
  DEFAULT_THEME_MODE,
  isThemeMode,
  otherThemeMode,
  storeThemeMode,
  storedThemeMode,
  THEME_ATTRIBUTE,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

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

  it("is night for a visitor who has not chosen, whatever their device is set to", () => {
    // Nothing here can be told what the device says, because nothing reads it: the
    // default is a constant, not a query. That is the whole of G16 in one line.
    expect(DEFAULT_THEME_MODE).toBe("dark");
    expect(currentThemeMode(document.documentElement)).toBe("dark");
    expect(currentThemeMode(null)).toBe("dark");
    expect(currentThemeMode(undefined)).toBe("dark");
  });

  it("falls back to night on a junk attribute rather than guessing from somewhere else", () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "navy");
    expect(currentThemeMode(document.documentElement)).toBe("dark");
  });

  it("lets the attribute on the page decide, which is the visitor's own choice", () => {
    applyThemeMode(document.documentElement, "light");
    expect(currentThemeMode(document.documentElement)).toBe("light");
    applyThemeMode(document.documentElement, "dark");
    expect(currentThemeMode(document.documentElement)).toBe("dark");
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
    // No stored choice is night, same as any other visitor who has not chosen.
    expect(currentThemeMode(document.documentElement)).toBe("dark");
  });

  it("boots from the same key and attribute the toggle writes, and swallows a storage error", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain(THEME_ATTRIBUTE);
    expect(THEME_BOOT_SCRIPT).toContain("catch(e){}");
    // It runs in the document, so it must not need a module, a bundler or a modern browser.
    expect(THEME_BOOT_SCRIPT).not.toMatch(/=>|const |let /);
  });
});
