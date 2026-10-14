/** The landing's headline and the line under it. Wording is Matt's, Oct 14; change it only on his word. */
export const HERO_HEADLINE = "Don't get scammed buying from strangers.";
/** The small line under it. Matt, Oct 14. "Two AI agents. One safe deal." left the hero and sits in "What Pay Pals does". */
export const HERO_TAGLINE = "Two AI pals check the photos, the cert and the chat before you pay.";

export function HeroHeadline() {
  return (
    <>
      <h1 className="text-[1.65rem] font-black leading-[1.15] tracking-tight text-navy sm:text-4xl lg:text-[2.35rem]">{HERO_HEADLINE}</h1>
      <p className="mt-3 text-base font-semibold leading-snug text-[var(--accent-ink)] sm:text-lg">{HERO_TAGLINE}</p>
    </>
  );
}
