/** The landing's headline and the line under it. Wording is Matt's, Oct 13; change it only on his word. */
export const HERO_HEADLINE = "Buying a $400 console or a $2,000 card from a stranger? Pay Pals checks the photos, the cert and the chat before you pay.";
export const HERO_TAGLINE = "Two AI agents. One safe deal.";

export function HeroHeadline() {
  return (
    <>
      <h1 className="text-[1.65rem] font-black leading-[1.15] tracking-tight text-navy sm:text-4xl lg:text-[2.35rem]">{HERO_HEADLINE}</h1>
      <p className="mt-3 text-lg font-bold text-[var(--accent-ink)] sm:text-xl">{HERO_TAGLINE}</p>
    </>
  );
}
