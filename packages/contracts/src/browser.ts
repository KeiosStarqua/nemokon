import { z } from "zod";

export const BROWSER_RESEARCH_MAX_STEPS_CAP = 25;
export const BROWSER_RESEARCH_MAX_PAGES_CAP = 10;
export const BROWSER_RESEARCH_TIMEOUT_MS_CAP = 300_000;

/** One browser research job: answer a question by reading a few pages. */
export const browserResearchRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
  conversationId: z.string().trim().min(1).max(200),
  question: z.string().trim().min(1).max(2000),
  startUrl: z.string().url().optional(),
  limits: z
    .object({
      maxSteps: z.number().int().min(1).max(BROWSER_RESEARCH_MAX_STEPS_CAP).optional(),
      maxPages: z.number().int().min(1).max(BROWSER_RESEARCH_MAX_PAGES_CAP).optional(),
      timeoutMs: z.number().int().min(15_000).max(BROWSER_RESEARCH_TIMEOUT_MS_CAP).optional(),
    })
    .optional(),
});
export type BrowserResearchRequest = z.infer<typeof browserResearchRequestSchema>;

export const browserSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().max(300),
  excerpt: z.string().max(500),
});
export type BrowserSource = z.infer<typeof browserSourceSchema>;

export const browserResearchResponseSchema = z
  .object({
    requestId: z.string().trim().min(1).max(200),
    status: z.enum(["completed", "failed"]),
    answer: z.string().max(8000).nullable(),
    sources: z.array(browserSourceSchema).max(10),
    stepsUsed: z.number().int().nonnegative(),
    error: z.string().max(500).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "completed" && (value.answer === null || value.answer.trim() === "")) {
      ctx.addIssue({ code: "custom", path: ["answer"], message: "A completed job must return an answer." });
    }
    if (value.status === "failed" && value.error === null) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "A failed job must explain why." });
    }
  });
export type BrowserResearchResponse = z.infer<typeof browserResearchResponseSchema>;
