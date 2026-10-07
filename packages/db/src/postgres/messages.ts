/**
 * Messages repository: the shared deal chat and the two private pal channels.
 * Ids are time-ordered so messages sent in the same millisecond keep order.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Message, MessageChannel } from "@pay-pals/contracts";
import { messages } from "../../schema";
import type { Db } from "./db";
import { forDeal } from "./deal-guard";
import { toMessage, toMessageRow } from "./mappers";
import { isUuid, uuidv7 } from "./uuid";

export function messagesRepo(db: Db) {
  return {
    async addMessage(message: Omit<Message, "id">): Promise<Message> {
      return forDeal(message.dealId, async () => {
        const [row] = await db.insert(messages).values({ id: uuidv7(), ...toMessageRow(message) }).returning();
        return toMessage(row!);
      });
    },

    async listMessages(dealId: string, channel?: MessageChannel): Promise<Message[]> {
      if (!isUuid(dealId)) return [];
      const where = channel ? and(eq(messages.dealId, dealId), eq(messages.channel, channel)) : eq(messages.dealId, dealId);
      const rows = await db.select().from(messages).where(where).orderBy(asc(messages.at), asc(messages.id));
      return rows.map(toMessage);
    },
  };
}
