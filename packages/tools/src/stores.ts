import { randomUUID } from "node:crypto";
import {
  OPEN_TASK_STATUSES,
  type Schedule,
  type ScheduleCreateInput,
  type Task,
  type TaskCreateInput,
  type TaskStatus,
} from "@nemokon/contracts";

/* ---- Ports. Every call is scoped by `conversationId`. Swap in SQLite/Postgres by implementing them. ---- */

export type TaskStore = {
  create(conversationId: string, input: TaskCreateInput): Promise<Task>;
  getBySeq(conversationId: string, seq: number): Promise<Task | null>;
  list(conversationId: string, options?: { statuses?: readonly TaskStatus[]; limit?: number }): Promise<Task[]>;
  update(
    conversationId: string,
    seq: number,
    patch: { title?: string; detail?: string | null; status?: TaskStatus },
  ): Promise<Task | null>;
};

export type ScheduleStore = {
  create(conversationId: string, input: ScheduleCreateInput): Promise<Schedule>;
  list(conversationId: string): Promise<Schedule[]>;
  /** Active one-shot schedules whose `runAt` is at or before `now`. A runner calls this on a timer. */
  listDue(now: Date): Promise<Schedule[]>;
  markFired(id: string, firedAt: Date): Promise<void>;
};

export type MemoryNote = { key: string; value: string; savedAt: string };

/** Stub for long-term notes about the user. Replace with a real store (vector or relational). */
export type NoteStore = {
  remember(conversationId: string, key: string, value: string): Promise<MemoryNote>;
  forget(conversationId: string, key: string): Promise<boolean>;
  list(conversationId: string): Promise<MemoryNote[]>;
};

/* ---- In-memory implementations (state is lost on restart). ---- */

export function createInMemoryTaskStore(now: () => Date = () => new Date()): TaskStore {
  const byConversation = new Map<string, Task[]>();
  const rows = (id: string) => {
    let list = byConversation.get(id);
    if (!list) byConversation.set(id, (list = []));
    return list;
  };
  return {
    async create(conversationId, input) {
      const list = rows(conversationId);
      const stamp = now().toISOString();
      const task: Task = {
        id: randomUUID(),
        conversationId,
        seq: list.length + 1,
        title: input.title,
        detail: input.detail ?? null,
        status: "open",
        createdAt: stamp,
        updatedAt: stamp,
        closedAt: null,
      };
      list.push(task);
      return { ...task };
    },
    async getBySeq(conversationId, seq) {
      const task = rows(conversationId).find((t) => t.seq === seq);
      return task ? { ...task } : null;
    },
    async list(conversationId, options = {}) {
      const statuses = options.statuses ?? OPEN_TASK_STATUSES;
      return rows(conversationId)
        .filter((t) => statuses.includes(t.status))
        .slice(0, options.limit ?? 50)
        .map((t) => ({ ...t }));
    },
    async update(conversationId, seq, patch) {
      const task = rows(conversationId).find((t) => t.seq === seq);
      if (!task) return null;
      const stamp = now().toISOString();
      if (patch.title !== undefined) task.title = patch.title;
      if (patch.detail !== undefined) task.detail = patch.detail;
      if (patch.status !== undefined) {
        task.status = patch.status;
        task.closedAt = patch.status === "done" || patch.status === "cancelled" ? stamp : null;
      }
      task.updatedAt = stamp;
      return { ...task };
    },
  };
}

export function createInMemoryScheduleStore(now: () => Date = () => new Date()): ScheduleStore {
  const all: Schedule[] = [];
  return {
    async create(conversationId, input) {
      const seq = all.filter((s) => s.conversationId === conversationId).length + 1;
      const schedule: Schedule = {
        id: randomUUID(),
        conversationId,
        seq,
        title: input.title,
        prompt: input.prompt,
        cadence: input.cadence,
        status: "active",
        createdAt: now().toISOString(),
        firedAt: null,
      };
      all.push(schedule);
      return { ...schedule };
    },
    async list(conversationId) {
      return all.filter((s) => s.conversationId === conversationId && s.status === "active").map((s) => ({ ...s }));
    },
    async listDue(at) {
      return all
        .filter((s) => s.status === "active" && new Date(s.cadence.runAt).getTime() <= at.getTime())
        .map((s) => ({ ...s }));
    },
    async markFired(id, firedAt) {
      const schedule = all.find((s) => s.id === id);
      if (!schedule) return;
      schedule.status = "done";
      schedule.firedAt = firedAt.toISOString();
    },
  };
}

export function createInMemoryNoteStore(now: () => Date = () => new Date()): NoteStore {
  const notes = new Map<string, Map<string, MemoryNote>>();
  const bucket = (id: string) => {
    let m = notes.get(id);
    if (!m) notes.set(id, (m = new Map()));
    return m;
  };
  return {
    async remember(conversationId, key, value) {
      const note = { key, value, savedAt: now().toISOString() };
      bucket(conversationId).set(key, note);
      return note;
    },
    async forget(conversationId, key) {
      return bucket(conversationId).delete(key);
    },
    async list(conversationId) {
      return [...bucket(conversationId).values()];
    },
  };
}
