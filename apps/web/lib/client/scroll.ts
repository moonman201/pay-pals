/** Bring a panel into view. Smooth, unless the visitor asked their system for less motion. */
export function scrollToPanel(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}
