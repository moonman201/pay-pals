/**
 * `test` for the scenario specs: the same Playwright test, with every folded section of the deal room
 * opened as it appears.
 *
 * 2026-10-13 (design pass, word budgets): the deal room keeps its panels closed behind a label and a
 * count, so a finished room reads in under 60 words. The scenario specs assert on what those panels
 * say, not on whether they start closed, so they run with the sections opened and keep their
 * expectations as written. That the sections start closed, and that one tap opens each, is pinned
 * once in folds.spec.ts, which uses the plain test.
 *
 * Only `[data-fold] > details` is opened. The verdict card's chips, the "Details" note and the
 * landing's taps are not folds and stay as the page left them.
 */
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const openAll = () => {
        for (const d of Array.from(document.querySelectorAll("[data-fold] > details:not([open])"))) d.setAttribute("open", "");
      };
      new MutationObserver(openAll).observe(document, { childList: true, subtree: true });
      document.addEventListener("DOMContentLoaded", openAll);
    });
    await use(page);
  },
});

export { expect };
