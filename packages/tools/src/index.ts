import type { MessagingChannel } from "@nemokon/channel";
import { createMemoryTools } from "./memory-tools";
import { createMessageTools } from "./message-tools";
import { createScheduleTools } from "./schedule-tools";
import {
  createInMemoryNoteStore,
  createInMemoryScheduleStore,
  createInMemoryTaskStore,
  type NoteStore,
  type ScheduleStore,
  type TaskStore,
} from "./stores";
import { createTaskTools } from "./task-tools";
import { createWebSearchTool, type WebSearchProvider } from "./web-search";

export * from "./context";
export * from "./memory-tools";
export * from "./message-tools";
export * from "./schedule-tools";
export * from "./stores";
export * from "./task-tools";
export * from "./web-search";

export type NemokonToolsDeps = {
  channel: MessagingChannel;
  tasks?: TaskStore;
  schedules?: ScheduleStore;
  notes?: NoteStore;
  /** Leave out to drop the `webSearch` tool. */
  webSearch?: WebSearchProvider;
  /** Messages `sendMessage` may send; build the tools once per turn for a per-turn cap. */
  maxMessagesPerTurn?: number;
};

/** The default tool set. Stores default to in-memory implementations. */
export function createNemokonTools(deps: NemokonToolsDeps) {
  return {
    ...createTaskTools(deps.tasks ?? createInMemoryTaskStore()),
    ...createScheduleTools(deps.schedules ?? createInMemoryScheduleStore()),
    ...createMemoryTools(deps.notes ?? createInMemoryNoteStore()),
    ...createMessageTools(deps.channel, { maxPerTurn: deps.maxMessagesPerTurn }),
    ...(deps.webSearch ? { webSearch: createWebSearchTool(deps.webSearch) } : {}),
  };
}
