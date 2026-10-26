import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import {
  MissingNebiusKeyError,
  NEBIUS_DEFAULT_BASE_URL,
  NEBIUS_DEFAULT_MODEL,
  createNemokonAgent,
  loadExecutionLimits,
  loadNebiusConfig,
  runAgentTurn,
  toMastraModel,
} from "../src/index";

test("provider config reads env and defaults to Token Factory", () => {
  assert.throws(() => loadNebiusConfig({}), MissingNebiusKeyError);
  const cfg = loadNebiusConfig({ NEBIUS_API_KEY: " k " });
  assert.equal(cfg.apiKey, "k");
  assert.equal(cfg.baseUrl, NEBIUS_DEFAULT_BASE_URL);
  assert.equal(cfg.baseUrl, "https://api.tokenfactory.nebius.com/v1/");
  assert.equal(cfg.modelId, NEBIUS_DEFAULT_MODEL);
  assert.equal(loadNebiusConfig({ NEBIUS_API_KEY: "k", NEBIUS_MODEL: "m/x" }).modelId, "m/x");
  assert.equal(toMastraModel(cfg).url, NEBIUS_DEFAULT_BASE_URL);
});

test("execution limits ignore bad env values", () => {
  const limits = loadExecutionLimits({ AGENT_MAX_STEPS: "3", AGENT_MAX_TOKENS: "nope", AGENT_TIMEOUT_MS: "5000" });
  assert.equal(limits.maxToolRounds, 3);
  assert.equal(limits.maxTokens, 1024);
  assert.equal(limits.timeoutMs, 5000);
});

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

test("agent sends an OpenAI-compatible request to the configured base URL", async () => {
  const seen: { url?: string; auth?: string; body?: { model?: string } } = {};
  const server = createServer(async (req, res) => {
    seen.url = req.url;
    seen.auth = req.headers.authorization;
    seen.body = JSON.parse(await readBody(req));
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        id: "cmpl-1",
        object: "chat.completion",
        created: 1,
        model: "fake/model",
        choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const provider = { apiKey: "test-key", modelId: "fake/model", baseUrl: `http://127.0.0.1:${port}/v1/` };
    const agent = createNemokonAgent({ instructions: "Reply briefly.", provider });
    const out = await runAgentTurn(agent, { conversationId: "c1", text: "ping" }, { modelId: provider.modelId });
    assert.equal(out.replyText, "pong");
    assert.equal(seen.url, "/v1/chat/completions");
    assert.equal(seen.auth, "Bearer test-key");
    assert.equal(seen.body?.model, "fake/model");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
