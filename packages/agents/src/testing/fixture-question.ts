/**
 * Reads the question a fixture's own Buyer Pal chat line asks, so tests can
 * assert on it without writing the wording out. Rewording a fixture then
 * cannot break a test that only cares that the question came through.
 *
 * The slicing here is plain string work on purpose: it shares no code with
 * the evidence modules it is used to test.
 */
import type { Message } from "@pay-pals/contracts";

export function fixtureQuestion(chat: Message[]): string {
  const line = chat.find((m) => m.author === "buyer_pal");
  if (!line) throw new Error("This fixture's chat has no Buyer Pal line.");
  const question = line.text.replace(/^Buyer Pal to seller:\s*/, "").match(/^[^?]*\?/);
  if (!question) throw new Error(`This fixture's Buyer Pal line asks nothing: ${line.text}`);
  return question[0];
}
