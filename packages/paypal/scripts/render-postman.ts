/**
 * Keeps docs/postman/pay-pals-sandbox.postman_collection.json in step with
 * the code: the two "create order" request bodies are rendered from
 * buildOrderBody with the clean-ps5 locked card, so the collection sends
 * exactly what the gate script and the app send. Secrets stay as Postman
 * variables. Run after a fixture or order-body change:
 *   npx tsx scripts/render-postman.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getFixture } from "@pay-pals/contracts";
import { buildOrderBody } from "../src/order-body";

const COLLECTION = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "postman", "pay-pals-sandbox.postman_collection.json");

interface PostmanItem {
  name: string;
  request: { body?: { mode: string; raw?: string } };
}

function renderBody(payeeVariable: string): string {
  const card = { ...getFixture("clean-ps5").cards[1]!, sellerPaypalEmail: payeeVariable };
  const body = buildOrderBody(card, "{{dealId}}");
  return JSON.stringify(body, null, 2);
}

const collection = JSON.parse(readFileSync(COLLECTION, "utf8")) as { item: PostmanItem[] };
const targets: Array<[string, string]> = [
  ["2a. Create order, payee = personal seller", "{{sellerPersonalEmail}}"],
  ["2b. Create order, payee = business seller", "{{sellerBusinessEmail}}"],
];
for (const [name, payee] of targets) {
  const item = collection.item.find((i) => i.name === name);
  if (!item?.request.body) throw new Error(`Request "${name}" not found in the collection`);
  item.request.body.raw = renderBody(payee);
}
writeFileSync(COLLECTION, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Rendered create-order bodies into ${COLLECTION}`);
