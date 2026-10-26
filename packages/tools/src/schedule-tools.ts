import { createTool } from "@mastra/core/tools";
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  SCHEDULE_ONESHOT_MAX_FUTURE_DAYS,
  SCHEDULE_PROMPT_MAX_LENGTH,
} from "@nemokon/contracts";
import { z } from "zod";
import { NO_CONVERSATION_ERROR, conversationIdFrom } from "./context";
import type { ScheduleStore } from "./stores";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createScheduleTools(store: ScheduleStore, now: () => Date = () => new Date()) {
  const scheduleCreate = createTool({
    id: "scheduleCreate",
    description:
      "Schedule a one-shot reminder or action at a future time. `runAt` is ISO 8601 with a UTC offset, e.g. 2030-01-31T09:00:00+07:00. " +
      "This only records the schedule; a runner outside the model fires it.",
    inputSchema: z.object({
      title: z.string().trim().min(1).max(200),
      prompt: z.string().trim().min(1).max(SCHEDULE_PROMPT_MAX_LENGTH).describe("What to do or say when it fires."),
      runAt: z.string().datetime({ offset: true }),
      timezone: z.string().trim().min(1).max(60).default(DEFAULT_SCHEDULE_TIMEZONE),
    }),
    execute: async ({ title, prompt, runAt, timezone }, context) => {
      const conversationId = conversationIdFrom(context);
      if (!conversationId) return NO_CONVERSATION_ERROR;
      const delta = new Date(runAt).getTime() - now().getTime();
      if (delta <= 0) return { error: "runAt must be in the future." };
      if (delta > SCHEDULE_ONESHOT_MAX_FUTURE_DAYS * DAY_MS) {
        return { error: `runAt may be at most ${SCHEDULE_ONESHOT_MAX_FUTURE_DAYS} days ahead.` };
      }
      const schedule = await store.create(conversationId, { title, prompt, cadence: { kind: "oneShot", runAt, timezone } });
      return { seq: schedule.seq, title: schedule.title, runAt, status: schedule.status };
    },
  });

  return { scheduleCreate };
}
