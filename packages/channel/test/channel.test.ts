import assert from "node:assert/strict";
import { test } from "node:test";
import { createEchoChannel, createStdoutChannel } from "../src/index";

test("echo channel records messages with ids", async () => {
  const channel = createEchoChannel();
  const a = await channel.sendText({ conversationId: "c1", text: "one" });
  const b = await channel.sendText({ conversationId: "c1", text: "two" });
  assert.notEqual(a.messageId, b.messageId);
  assert.deepEqual(
    channel.sent.map((m) => m.text),
    ["one", "two"],
  );
  channel.clear();
  assert.equal(channel.sent.length, 0);
});

test("stdout channel writes a tagged line", async () => {
  const lines: string[] = [];
  const channel = createStdoutChannel({ write: (l) => lines.push(l) });
  await channel.sendText({ conversationId: "c9", text: "hello" });
  assert.deepEqual(lines, ["[c9] hello\n"]);
});
