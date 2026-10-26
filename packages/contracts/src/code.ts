import { z } from "zod";

/** Longest source one run accepts. The model writes it, so it stays short. */
export const CODE_RUN_MAX_CHARS = 6000;
export const CODE_RUN_TIMEOUT_MS_DEFAULT = 10_000;
export const CODE_RUN_TIMEOUT_MS_CAP = 20_000;
/** Characters of stdout and of stderr returned. Longer output is cut and flagged. */
export const CODE_OUTPUT_MAX_CHARS = 8000;

/** Run one script inside a sandbox and wait for its output. */
export const codeRunRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  language: z.enum(["python"]).default("python"),
  code: z.string().min(1).max(CODE_RUN_MAX_CHARS),
  timeoutMs: z.number().int().min(1000).max(CODE_RUN_TIMEOUT_MS_CAP).optional(),
});
export type CodeRunRequest = z.input<typeof codeRunRequestSchema>;

export const CODE_RUN_STATUSES = ["completed", "failed", "timeout"] as const;
export const codeRunStatusSchema = z.enum(CODE_RUN_STATUSES);
export type CodeRunStatus = z.infer<typeof codeRunStatusSchema>;

export const codeRunResponseSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  status: codeRunStatusSchema,
  stdout: z.string().max(CODE_OUTPUT_MAX_CHARS),
  stderr: z.string().max(CODE_OUTPUT_MAX_CHARS),
  /** `null` when the script was killed before it exited. */
  exitCode: z.number().int().nullable(),
  truncated: z.boolean(),
  durationMs: z.number().int().min(0),
});
export type CodeRunResponse = z.infer<typeof codeRunResponseSchema>;
