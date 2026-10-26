import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

export type ConversationMemoryStorageConfig = {
  /** Mastra libSQL URL: `file:./mastra.db` (default) or `:memory:` for tests. */
  libsqlUrl?: string;
  /** Auth token, only for a remote libSQL/Turso URL. */
  authToken?: string;
};

export const LIBSQL_DEFAULT_URL = "file:./mastra.db";

/** Mastra storage that persists agent threads and messages. */
export function createConversationMemoryStorage(config: ConversationMemoryStorageConfig = {}) {
  const url = config.libsqlUrl?.trim() || LIBSQL_DEFAULT_URL;
  const authToken = config.authToken?.trim();
  return new LibSQLStore({
    id: "nemokon-agent-memory",
    url,
    ...(authToken ? { authToken } : {}),
  });
}

export type ConversationMemoryOptions = ConversationMemoryStorageConfig & {
  /** How many recent messages of the thread go back into the prompt. */
  lastMessages?: number;
};

/** Mastra `Memory` bound to libSQL. Pass it to the agent factory. */
export function createConversationMemory(options: ConversationMemoryOptions = {}) {
  const { lastMessages = 20, ...storageConfig } = options;
  return new Memory({
    storage: createConversationMemoryStorage(storageConfig),
    options: { lastMessages },
  });
}
