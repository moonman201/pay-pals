/**
 * What a flag's evidence line is allowed to show. The pals quote the rule
 * that fired, which is worth reading, but a line that starts with "Photo
 * block" is an artifact of how a photo was handed to the model, not
 * evidence about the deal, so it never reaches the page.
 */
export function visibleEvidence(evidence: string | null | undefined): string | null {
  const text = evidence?.trim();
  if (!text) return null;
  if (/^photo block/i.test(text)) return null;
  return text;
}
