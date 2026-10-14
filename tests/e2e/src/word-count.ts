/**
 * Counts the words a visitor can read without clicking anything. Shared by the budget script
 * (scripts/word-budget.ts) and by folds.spec.ts, so the number printed and the number asserted
 * are the same count.
 *
 * "Visible" means a text node whose element is rendered (not display:none, visibility:hidden or
 * opacity 0), is not inside a one-pixel clipped screen-reader-only box, and is not inside a closed
 * <details> (its <summary> counts). The first-screen count also needs the text to sit inside the
 * viewport at scroll 0. Images, placeholders and alt text are not words on the page.
 */
import type { Page } from "@playwright/test";

/** Budgets from Matt, Oct 13. */
export const LANDING_BUDGET = 250;
export const ROOM_BUDGET = 60;

/** Runs in the page. Returns the visible words, optionally only those inside the first screen. */
function visibleWordsInPage(firstScreenOnly: boolean): string[] {
  const out: string[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
    // A closed <details> shows its first <summary> and nothing else.
    const details = el.closest("details");
    if (details && !details.open && !el.closest("summary")) continue;
    let hidden = false;
    for (let a: Element | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0" || cs.contentVisibility === "hidden") {
        hidden = true;
        break;
      }
      // A screen-reader-only box is one pixel with its overflow clipped, and its text still lays out at full size.
      if (cs.overflow !== "visible") {
        const box = a.getBoundingClientRect();
        if (box.width <= 1 || box.height <= 1) {
          hidden = true;
          break;
        }
      }
    }
    if (hidden) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
    if (rects.length === 0) continue;
    if (firstScreenOnly && !rects.some((r) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)) continue;
    out.push(...text.split(/\s+/).filter(Boolean));
  }
  return out;
}

export async function visibleWords(page: Page, firstScreenOnly: boolean): Promise<string[]> {
  return page.evaluate(visibleWordsInPage, firstScreenOnly);
}
