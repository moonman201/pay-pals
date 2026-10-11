/**
 * The classes that make a text link something a thumb can hit.
 *
 * Rule 11 from the Oct 9 visual pass: every control is at least 44 px tall.
 * An anchor inside a sentence is the height of its text, about 16 px, and
 * the Oct 11 room pass added several of them, because rule 1 ("link to it
 * instead of restating it") turns a sentence into a control. Those links
 * are the mechanism the whole shortening rests on, so every one of them is
 * something a judge on a phone has to hit.
 *
 * inline-flex with a minimum height grows the anchor's own box, which is
 * both what a thumb hits and what qa measures with getBoundingClientRect.
 * Padding on a ::after overlay would look right and measure wrong, and a
 * rule nobody can measure is a rule that rots.
 *
 * The cost is that the line of text it sits in grows to 44 px. That is the
 * right cost: the alternative is a control a thumb misses.
 */
export const TAP_LINK = "inline-flex min-h-11 items-center";

/** The same, for a link whose text may wrap to a second line inside a paragraph. */
export const TAP_LINK_WRAPPING = "inline-flex min-h-11 items-center text-left";
