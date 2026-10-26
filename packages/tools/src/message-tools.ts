import { createTool } from "@mastra/core/tools";
import type { MessagingChannel } from "@nemokon/channel";
import { z } from "zod";
import { NO_CONVERSATION_ERROR, conversationIdFrom } from "./context";

export const MESSAGE_TEXT_MAX = 2000;
export const MESSAGES_PER_TURN_MAX = 3;

/**
 * Sends a text to the person of the *current* conversation through the channel port. The model
 * cannot pick the recipient. `maxPerTurn` bounds how many messages one tool instance may send, so
 * create the tools once per turn if you want a per-turn cap.
 */
export function createMessageTools(channel: MessagingChannel, options: { maxPerTurn?: number } = {}) {
  const limit = options.maxPerTurn ?? MESSAGES_PER_TURN_MAX;
  let sent = 0;
  const sendMessage = createTool({
    id: "sendMessage",
    description:
      "Send a message right now to the user in this conversation, then keep working. " +
      "Use it for progress updates. The final answer does not need this tool.",
    inputSchema: z.object({ text: z.string().trim().min(1).max(MESSAGE_TEXT_MAX) }),
    execute: async ({ text }, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      if (sent >= limit) return { error: `Already sent ${limit} messages this turn. Put the rest in the final answer.` };
      try {
        await channel.sendText({ conversationId, text });
      } catch {
        return { error: "The message was not delivered. Put the content in the final answer." };
      }
      sent += 1;
      return { sent: true };
    },
  });
  return { sendMessage };
}
