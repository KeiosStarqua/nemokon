import { z } from "zod";

export const SCHEDULE_STATUSES = ["active", "done", "cancelled"] as const;
export const scheduleStatusSchema = z.enum(SCHEDULE_STATUSES);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

export const SCHEDULE_PROMPT_MAX_LENGTH = 1000;
/** A one-shot schedule may not be set further ahead than this. */
export const SCHEDULE_ONESHOT_MAX_FUTURE_DAYS = 180;
export const DEFAULT_SCHEDULE_TIMEZONE = "UTC";

/** Run once at a point in time (ISO 8601 with offset). Recurring cadences are out of scope for the scaffold. */
export const scheduleOneShotSchema = z.object({
  kind: z.literal("oneShot"),
  runAt: z.string().datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(60).default(DEFAULT_SCHEDULE_TIMEZONE),
});
export type ScheduleOneShot = z.infer<typeof scheduleOneShotSchema>;

export const scheduleCadenceSchema = z.discriminatedUnion("kind", [scheduleOneShotSchema]);
export type ScheduleCadence = z.infer<typeof scheduleCadenceSchema>;

export const scheduleSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().min(1),
  seq: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  /** What to do when the schedule fires. */
  prompt: z.string().trim().min(1).max(SCHEDULE_PROMPT_MAX_LENGTH),
  cadence: scheduleCadenceSchema,
  status: scheduleStatusSchema,
  createdAt: z.string().datetime(),
  firedAt: z.string().datetime().nullable(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const scheduleCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(SCHEDULE_PROMPT_MAX_LENGTH),
  cadence: scheduleCadenceSchema,
});
export type ScheduleCreateInput = z.infer<typeof scheduleCreateInputSchema>;
