import assert from "node:assert/strict";
import { test } from "node:test";
import { isLoopbackHost, resolveServerOptions } from "../src/server-options";

test("defaults to loopback and port 8787 without a token", () => {
  assert.deepEqual(resolveServerOptions({}), { hostname: "127.0.0.1", port: 8787 });
  assert.deepEqual(resolveServerOptions({ HOST: "  ", PORT: "" }), { hostname: "127.0.0.1", port: 8787 });
});

test("loopback hosts do not need a token", () => {
  for (const HOST of ["127.0.0.1", "localhost", "::1", "[::1]", "127.0.0.2"]) {
    assert.equal(resolveServerOptions({ HOST }).hostname, HOST);
  }
});

test("non-loopback HOST without a token throws", () => {
  for (const HOST of ["0.0.0.0", "::", "10.0.0.5", "example.test"]) {
    assert.throws(() => resolveServerOptions({ HOST }), /DEMO_TOKEN/);
  }
});

test("whitespace-only token counts as unset", () => {
  assert.throws(() => resolveServerOptions({ HOST: "0.0.0.0", DEMO_TOKEN: "   " }), /DEMO_TOKEN/);
  assert.equal(resolveServerOptions({ DEMO_TOKEN: "  " }).token, undefined);
});

test("non-loopback HOST with a token resolves, token is trimmed", () => {
  assert.deepEqual(resolveServerOptions({ HOST: "0.0.0.0", PORT: "8080", DEMO_TOKEN: " s3cret " }), {
    hostname: "0.0.0.0",
    port: 8080,
    token: "s3cret",
  });
});

test("PORT must be an integer in 1..65535", () => {
  for (const PORT of ["0", "65536", "-1", "80.5", "abc", "8787x", "1e3"]) {
    assert.throws(() => resolveServerOptions({ PORT }), /PORT/);
  }
  assert.equal(resolveServerOptions({ PORT: "1" }).port, 1);
  assert.equal(resolveServerOptions({ PORT: "65535" }).port, 65535);
});

test("isLoopbackHost is case- and space-insensitive", () => {
  assert.equal(isLoopbackHost(" LocalHost "), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
});
