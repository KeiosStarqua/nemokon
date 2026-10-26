# @nemokon/sandbox

The port the agent uses to run untrusted code, and a thin stub for [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell).

```ts
interface SandboxClient {
  run(request: CodeRunRequest): Promise<CodeRunResponse>; // schemas in @nemokon/contracts
}
```

`createOpenShellClient({ transport })` parses the request, calls your `transport`, and validates the response
(including that `requestId` matches). Without a transport it throws `OpenShellNotWiredError`.
`createFakeSandboxClient()` returns a canned result for tests.

## Wiring OpenShell

OpenShell runs agents and code in policy-enforced sandboxes. Install the CLI and start a gateway as in the
[OpenShell docs](https://docs.nvidia.com/openshell/latest/llms.txt) (the quickstart uses `openshell sandbox create -- <command>`).
Then write a transport that:

1. creates or reuses a sandbox whose policy denies network access by default;
2. runs `request.code` with the language runtime inside it;
3. enforces `request.timeoutMs` and cuts stdout/stderr at `CODE_OUTPUT_MAX_CHARS`;
4. returns `{ requestId, status: "completed" | "failed" | "timeout", stdout, stderr, exitCode, truncated, durationMs }`.

A script that fails or times out is a normal result, not a thrown error. Throw only for transport problems.
Treat the exact CLI or API calls as your integration work: this package does not ship them, so check them against the OpenShell version you install.

```ts
const sandbox = createOpenShellClient({ transport: myOpenShellTransport });
const result = await sandbox.run({ requestId: "r1", code: "print(2 + 2)" });
```
