/**
 * Messages repository: the shared deal chat and the two private pal channels.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Message, MessageChannel } from "@pay-pals/contracts";
import { messages } from "../../schema";
import { DealNotFoundError } from "../errors";
import type { Db } from "./db";
import { toMessage, toMessageRow } from "./mappers";
import { isUuid } from "./uuid";

export function messagesRepo(db: Db) {
  return {
    async addMessage(message: Omit<Message, "id">): Promise<Message> {
      if (!isUuid(message.dealId)) throw new DealNotFoundError(message.dealId);
      const [row] = await db.insert(messages).values(toMessageRow(message)).returning();
      return toMessage(row!);
    },

    async listMessages(dealId: string, channel?: MessageChannel): Promise<Message[]> {
      if (!isUuid(dealId)) return [];
      const where = channel ? and(eq(messages.dealId, dealId), eq(messages.channel, channel)) : eq(messages.dealId, dealId);
      const rows = await db.select().from(messages).where(where).orderBy(asc(messages.at));
      return rows.map(toMessage);
    },
  };
}
