import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentTurnRequestSchema,
  browserResearchResponseSchema,
  codeRunRequestSchema,
  scheduleCreateInputSchema,
  taskCreateInputSchema,
} from "../src/index";

test("agent turn trims text and rejects empty", () => {
  assert.equal(agentTurnRequestSchema.parse({ conversationId: "c1", text: "  hi " }).text, "hi");
  assert.equal(agentTurnRequestSchema.safeParse({ conversationId: "c1", text: "  " }).success, false);
});

test("task create requires a title", () => {
  assert.equal(taskCreateInputSchema.safeParse({ title: "" }).success, false);
  assert.equal(taskCreateInputSchema.safeParse({ title: "Buy milk" }).success, true);
});

test("oneShot schedule needs an ISO datetime with offset", () => {
  const ok = scheduleCreateInputSchema.safeParse({
    title: "Stretch",
    prompt: "Remind me to stretch",
    cadence: { kind: "oneShot", runAt: "2030-01-01T09:00:00+07:00" },
  });
  assert.equal(ok.success, true);
  const bad = scheduleCreateInputSchema.safeParse({
    title: "x",
    prompt: "y",
    cadence: { kind: "oneShot", runAt: "tomorrow" },
  });
  assert.equal(bad.success, false);
});

test("code run defaults language to python", () => {
  assert.equal(codeRunRequestSchema.parse({ requestId: "r", code: "print(1)" }).language, "python");
});

test("completed browser job must carry an answer", () => {
  const base = { requestId: "r", sources: [], stepsUsed: 1, error: null };
  assert.equal(browserResearchResponseSchema.safeParse({ ...base, status: "completed", answer: null }).success, false);
  assert.equal(browserResearchResponseSchema.safeParse({ ...base, status: "completed", answer: "ok" }).success, true);
});
