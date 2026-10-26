import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenShellNotWiredError, createFakeSandboxClient, createOpenShellClient } from "../src/index";

test("unwired OpenShell client fails loudly", async () => {
  await assert.rejects(() => createOpenShellClient().run({ requestId: "r", code: "print(1)" }), OpenShellNotWiredError);
});

test("transport output is validated and request is parsed", async () => {
  const client = createOpenShellClient({
    transport: async (req) => ({
      requestId: req.requestId,
      status: "completed",
      stdout: `ran ${req.language}`,
      stderr: "",
      exitCode: 0,
      truncated: false,
      durationMs: 3,
    }),
  });
  const out = await client.run({ requestId: "r1", code: "print(1)" });
  assert.equal(out.stdout, "ran python");
});

test("bad requests and mismatched ids are rejected", async () => {
  const client = createOpenShellClient({
    transport: async () => ({
      requestId: "other",
      status: "completed",
      stdout: "",
      stderr: "",
      exitCode: 0,
      truncated: false,
      durationMs: 0,
    }),
  });
  await assert.rejects(() => client.run({ requestId: "", code: "x" }));
  await assert.rejects(() => client.run({ requestId: "r", code: "x" }), /different requestId/);
});

test("fake sandbox returns canned result", async () => {
  const out = await createFakeSandboxClient({ stdout: "hi" }).run({ requestId: "r", code: "x" });
  assert.equal(out.stdout, "hi");
});
