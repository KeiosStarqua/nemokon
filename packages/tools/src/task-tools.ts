import { createTool } from "@mastra/core/tools";
import { TASK_STATUSES, taskStatusSchema } from "@nemokon/contracts";
import { z } from "zod";
import { NO_CONVERSATION_ERROR, conversationIdFrom } from "./context";
import type { TaskStore } from "./stores";

const NOT_FOUND = (seq: number) => ({ error: `No task #${seq} in this conversation.` });

export function createTaskTools(store: TaskStore) {
  const taskCreate = createTool({
    id: "taskCreate",
    description: "Add a task to the user's task list. Use it when the user asks you to track something.",
    inputSchema: z.object({
      title: z.string().trim().min(1).max(200).describe("Short imperative title."),
      detail: z.string().max(4000).optional().describe("Optional longer note."),
    }),
    execute: async (input, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      const task = await store.create(conversationId, input);
      return { seq: task.seq, title: task.title, status: task.status };
    },
  });

  const taskList = createTool({
    id: "taskList",
    description: "List the user's tasks. Defaults to open tasks; pass `statuses` to see closed ones.",
    inputSchema: z.object({
      statuses: z.array(taskStatusSchema).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async (input, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      const tasks = await store.list(conversationId, input);
      return { tasks: tasks.map((t) => ({ seq: t.seq, title: t.title, detail: t.detail, status: t.status })) };
    },
  });

  const taskUpdate = createTool({
    id: "taskUpdate",
    description: "Change a task's title, detail or status. Refer to the task by its number (seq).",
    inputSchema: z.object({
      seq: z.number().int().positive(),
      title: z.string().trim().min(1).max(200).optional(),
      detail: z.string().max(4000).nullable().optional(),
      status: z.enum(TASK_STATUSES).optional(),
    }),
    execute: async ({ seq, ...patch }, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      const task = await store.update(conversationId, seq, patch);
      return task ? { seq: task.seq, title: task.title, status: task.status } : NOT_FOUND(seq);
    },
  });

  const taskClose = createTool({
    id: "taskClose",
    description: "Close a task as done (default) or cancelled.",
    inputSchema: z.object({
      seq: z.number().int().positive(),
      outcome: z.enum(["done", "cancelled"]).default("done"),
    }),
    execute: async ({ seq, outcome }, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      const task = await store.update(conversationId, seq, { status: outcome });
      return task ? { seq: task.seq, title: task.title, status: task.status } : NOT_FOUND(seq);
    },
  });

  return { taskCreate, taskList, taskUpdate, taskClose };
}
