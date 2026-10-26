import { readFileSync } from "node:fs";
import { join } from "node:path";
import { taskStatusSchema } from "@nemokon/contracts";
import type { NoteStore, TaskStore } from "@nemokon/tools";
import { z } from "zod";
import { resolvePath } from "./config";

const tasksFileSchema = z.array(
  z.object({
    title: z.string().min(1),
    detail: z.string().nullable().optional(),
    status: taskStatusSchema.default("open"),
  }),
);
const notesFileSchema = z.array(z.object({ key: z.string().min(1), value: z.string().min(1) }));

/** Loads the fake tasks and notes in `dir` into the stores for one conversation. */
export async function seedSampleData(options: { dir: string; conversationId: string; tasks: TaskStore; notes: NoteStore }) {
  const dir = resolvePath(options.dir);
  const tasks = tasksFileSchema.parse(JSON.parse(readFileSync(join(dir, "tasks.json"), "utf8")));
  const notes = notesFileSchema.parse(JSON.parse(readFileSync(join(dir, "notes.json"), "utf8")));
  for (const item of tasks) {
    const created = await options.tasks.create(options.conversationId, { title: item.title, detail: item.detail ?? undefined });
    if (item.status !== "open") await options.tasks.update(options.conversationId, created.seq, { status: item.status });
  }
  for (const note of notes) await options.notes.remember(options.conversationId, note.key, note.value);
  return { tasks: tasks.length, notes: notes.length };
}
