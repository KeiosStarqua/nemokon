import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import { CONVERSATION_ID_CONTEXT_KEY } from "@nemokon/contracts";
import { createEchoChannel } from "@nemokon/channel";
import { createNemokonTools, createTavilyProvider, createWebSearchProviderFromEnv } from "../src/index";

function ctx(conversationId: string) {
  const requestContext = new RequestContext();
  requestContext.set(CONVERSATION_ID_CONTEXT_KEY, conversationId);
  return { requestContext };
}

// Tools are Mastra tools; `execute` is optional in the type, so assert it exists once.
async function run<T>(tool: { execute?: (...args: never[]) => unknown }, input: unknown, c: unknown): Promise<T> {
  assert.ok(tool.execute);
  return (await (tool.execute as (i: unknown, c: unknown) => Promise<T>)(input, c)) as T;
}

test("task lifecycle is scoped per conversation", async () => {
  const tools = createNemokonTools({ channel: createEchoChannel() });
  const a = ctx("a");
  const b = ctx("b");

  await run(tools.taskCreate, { title: "Write report" }, a);
  await run(tools.taskCreate, { title: "Water plants" }, b);

  const listA = await run<{ tasks: { seq: number; title: string }[] }>(tools.taskList, {}, a);
  assert.deepEqual(listA.tasks.map((t) => t.title), ["Write report"]);

  await run(tools.taskUpdate, { seq: 1, status: "in_progress" }, a);
  const closed = await run<{ status: string }>(tools.taskClose, { seq: 1 }, a);
  assert.equal(closed.status, "done");

  assert.deepEqual((await run<{ tasks: unknown[] }>(tools.taskList, {}, a)).tasks, []);
  const all = await run<{ tasks: unknown[] }>(tools.taskList, { statuses: ["done"] }, a);
  assert.equal(all.tasks.length, 1);

  assert.deepEqual(await run(tools.taskClose, { seq: 9 }, a), { error: "No task #9 in this conversation." });
});

test("tools refuse to run without a conversation", async () => {
  const tools = createNemokonTools({ channel: createEchoChannel() });
  const out = await run<{ error?: string }>(tools.taskList, {}, { requestContext: new RequestContext() });
  assert.match(out.error ?? "", /No conversation/);
});

test("scheduleCreate validates the time window", async () => {
  const tools = createNemokonTools({ channel: createEchoChannel() });
  const c = ctx("c");
  const past = await run<{ error?: string }>(tools.scheduleCreate, { title: "t", prompt: "p", runAt: "2000-01-01T00:00:00Z" }, c);
  assert.match(past.error ?? "", /future/);
  const far = await run<{ error?: string }>(tools.scheduleCreate, { title: "t", prompt: "p", runAt: "2999-01-01T00:00:00Z" }, c);
  assert.match(far.error ?? "", /days ahead/);
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const ok = await run<{ seq?: number }>(tools.scheduleCreate, { title: "t", prompt: "p", runAt: soon }, c);
  assert.equal(ok.seq, 1);
});

test("remember and forget", async () => {
  const tools = createNemokonTools({ channel: createEchoChannel() });
  const c = ctx("c");
  assert.deepEqual(await run(tools.remember, { key: "name", value: "Sam" }, c), { saved: true, key: "name" });
  assert.deepEqual(await run(tools.forget, { key: "name" }, c), { forgotten: true });
  assert.deepEqual(await run(tools.forget, { key: "name" }, c), { forgotten: false });
});

test("sendMessage goes to the current conversation and respects the cap", async () => {
  const channel = createEchoChannel();
  const tools = createNemokonTools({ channel, maxMessagesPerTurn: 1 });
  const c = ctx("conv-7");
  assert.deepEqual(await run(tools.sendMessage, { text: "first" }, c), { sent: true });
  const second = await run<{ error?: string }>(tools.sendMessage, { text: "second" }, c);
  assert.match(second.error ?? "", /Already sent/);
  assert.deepEqual(channel.sent.map((m) => [m.conversationId, m.text]), [["conv-7", "first"]]);
});

test("webSearch exists only with a provider; Tavily adapter maps results", async () => {
  assert.equal("webSearch" in createNemokonTools({ channel: createEchoChannel() }), false);
  assert.equal(createWebSearchProviderFromEnv({}), undefined);

  let seenAuth: string | null = null;
  const fakeFetch: typeof fetch = async (_url, init) => {
    seenAuth = new Headers(init?.headers).get("authorization");
    return new Response(JSON.stringify({ results: [{ title: "T", url: "https://example.test/a", content: "snippet" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const provider = createTavilyProvider({ apiKey: "fake", fetch: fakeFetch });
  const tools = createNemokonTools({ channel: createEchoChannel(), webSearch: provider });
  assert.ok("webSearch" in tools);
  const out = await run<{ results: { url: string }[] }>(tools.webSearch!, { query: "x" }, ctx("c"));
  assert.equal(out.results[0]?.url, "https://example.test/a");
  assert.equal(seenAuth, "Bearer fake");
});
