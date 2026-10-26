import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app";
import { configSchema, loadConfig, loadInstructions, parseConfig, renderPrompt } from "../src/config";

const ok = async (req: { conversationId: string; text: string }) => ({ replyText: `echo: ${req.text}`, modelId: "m" });

const post = (app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) =>
  app.request("/turn", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("POST /turn returns the reply", async () => {
  const res = await post(createApp({ runTurn: ok }), { conversationId: "c", text: "hi" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { replyText: "echo: hi", modelId: "m" });
});

test("POST /turn validates the body", async () => {
  const app = createApp({ runTurn: ok });
  assert.equal((await post(app, { conversationId: "c" })).status, 400);
  assert.equal((await post(app, "not json")).status, 400);
});

test("bearer token is enforced when configured", async () => {
  const app = createApp({ runTurn: ok, token: "secret" });
  const body = { conversationId: "c", text: "hi" };
  assert.equal((await post(app, body)).status, 401);
  assert.equal((await post(app, body, { authorization: "Bearer wrong!" })).status, 401);
  assert.equal((await post(app, body, { authorization: "Bearer secret" })).status, 200);
  assert.equal((await app.request("/health")).status, 200);
});

test("runtime errors become a generic 502", async () => {
  let seen: unknown;
  const app = createApp({
    runTurn: async () => {
      throw new Error("boom with internals");
    },
    onError: (e) => (seen = e),
  });
  const res = await post(app, { conversationId: "c", text: "hi" });
  assert.equal(res.status, 502);
  assert.doesNotMatch(JSON.stringify(await res.json()), /internals/);
  assert.ok(seen);
});

test("config.example.yaml parses and the prompt renders in 10-15 lines", () => {
  const config = loadConfig("config.example.yaml");
  assert.equal(config.assistant.language, "en");
  assert.equal(config.models.chat, null);
  const prompt = loadInstructions(config);
  const lines = prompt.split("\n").filter((l) => l.trim());
  assert.ok(lines.length >= 10 && lines.length <= 15, `prompt has ${lines.length} lines`);
  assert.doesNotMatch(prompt, /\{\{/);
});

test("config defaults and prompt placeholders", () => {
  assert.equal(parseConfig("assistant: {}").limits.max_tool_rounds, 8);
  assert.equal(configSchema.safeParse({}).success, false);
  assert.equal(renderPrompt("hi {{name}} {{x}}", { name: "A" }), "hi A {{x}}");
});
