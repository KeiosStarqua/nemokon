import assert from "node:assert/strict";
import { test } from "node:test";
import { LIBSQL_DEFAULT_URL, createConversationMemory, createConversationMemoryStorage } from "../src/index";

test("default URL is a local file", () => {
  assert.equal(LIBSQL_DEFAULT_URL, "file:./mastra.db");
});

test("in-memory storage and memory construct", () => {
  assert.ok(createConversationMemoryStorage({ libsqlUrl: ":memory:" }));
  assert.ok(createConversationMemory({ libsqlUrl: ":memory:", lastMessages: 5 }));
});
