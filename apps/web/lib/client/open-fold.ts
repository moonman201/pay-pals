"use client";

import { useEffect } from "react";

/**
 * The deal room keeps most of its panels folded. A link that points at something inside one
 * (the history badge to the timeline, a flag's quote to the chat message it came from, a status
 * note to the panel it counts) would land on nothing, so every folded ancestor is opened first.
 */
export function openFoldsAround(target: Element | null): void {
  // The target may be a folded panel itself: its details element is its child, not its ancestor.
  if (target?.hasAttribute("data-fold")) {
    const own = target.querySelector(":scope > details");
    if (own instanceof HTMLDetailsElement) own.open = true;
  }
  for (let el = target; el; el = el.parentElement) {
    if (el instanceof HTMLDetailsElement) el.open = true;
  }
}

/** Open a folded panel by its id and bring it into view. */
export function openFold(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  openFoldsAround(el);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Opens the folds around a #hash target, on load and on every later link to one. */
export function useFoldHashOpen(): void {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) openFoldsAround(document.getElementById(id));
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#']");
      const href = a?.getAttribute("href");
      if (href && href.length > 1) {
        const target = document.getElementById(decodeURIComponent(href.slice(1)));
        openFoldsAround(target);
        // The hash does not change when the link is to the current one, so scroll here as well.
        target?.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", open);
      document.removeEventListener("click", onClick);
    };
  }, []);
}
