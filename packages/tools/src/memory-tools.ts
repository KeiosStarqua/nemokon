import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { NO_CONVERSATION_ERROR, conversationIdFrom } from "./context";
import type { NoteStore } from "./stores";

/** Stub long-term notes. The default store is in-memory; plug in your own `NoteStore` for persistence. */
export function createMemoryTools(store: NoteStore) {
  const remember = createTool({
    id: "remember",
    description: "Save a short fact about the user so you can use it later (a preference, a name, a habit).",
    inputSchema: z.object({
      key: z.string().trim().min(1).max(80).describe("Short label, e.g. `preferred_name`."),
      value: z.string().trim().min(1).max(500),
    }),
    execute: async ({ key, value }, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      const note = await store.remember(conversationId, key, value);
      return { saved: true, key: note.key };
    },
  });

  const forget = createTool({
    id: "forget",
    description: "Delete a saved fact about the user by its key.",
    inputSchema: z.object({ key: z.string().trim().min(1).max(80) }),
    execute: async ({ key }, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      return { forgotten: await store.forget(conversationId, key) };
    },
  });

  return { remember, forget };
}
