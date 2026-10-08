/**
 * Presentation flag only. publicMode changes nothing about what the pals
 * decide: flags, verdicts, mismatches and the honesty guard are the same.
 * It only drops the sentences that say a photo file could not be loaded,
 * which the hosted demo shows until the real photos exist. Pass it to the
 * factories or set PAY_PALS_PUBLIC_MODE=1.
 */

export function isPublicMode(option?: boolean | null): boolean {
  if (typeof option === "boolean") return option;
  return process.env.PAY_PALS_PUBLIC_MODE === "1";
}

/** Model-facing instruction for public mode. */
export const PUBLIC_MODE_INSTRUCTION =
  "Do not mention whether photo files loaded, opened or could be viewed. Say only what you checked from the card and the chat.";
