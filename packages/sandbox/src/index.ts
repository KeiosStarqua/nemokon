/**
 * @nemokon/sandbox: the port the agent uses to run untrusted code, plus a thin stub for NVIDIA
 * OpenShell (https://github.com/NVIDIA/OpenShell). The stub validates requests and responses
 * against `@nemokon/contracts` and delegates the actual execution to a transport you supply.
 * No OpenShell call is made by this package; see README.md for how to wire one.
 */

import { codeRunRequestSchema, codeRunResponseSchema, type CodeRunRequest, type CodeRunResponse } from "@nemokon/contracts";

/** The port. Anything that can run a script and report how it ended. */
export interface SandboxClient {
  run(request: CodeRunRequest): Promise<CodeRunResponse>;
}

export type ParsedCodeRunRequest = ReturnType<typeof codeRunRequestSchema.parse>;

/**
 * Does the real work: create or reuse an OpenShell sandbox, run `request.code` in it under the
 * sandbox policy, enforce `request.timeoutMs`, and map the outcome to a `CodeRunResponse`.
 * A script that fails or times out is a normal result (`status: "failed" | "timeout"`), not a throw.
 */
export type OpenShellTransport = (request: ParsedCodeRunRequest) => Promise<CodeRunResponse>;

export class OpenShellNotWiredError extends Error {
  constructor() {
    super("OpenShell transport is not wired. Pass `transport` to createOpenShellClient; see packages/sandbox/README.md.");
    this.name = "OpenShellNotWiredError";
  }
}

export type OpenShellClientOptions = {
  /** Your OpenShell integration. Omit to get a client that fails loudly with `OpenShellNotWiredError`. */
  transport?: OpenShellTransport;
};

export function createOpenShellClient(options: OpenShellClientOptions = {}): SandboxClient {
  const transport: OpenShellTransport =
    options.transport ??
    (async () => {
      throw new OpenShellNotWiredError();
    });

  return {
    async run(request) {
      const parsed = codeRunRequestSchema.parse(request);
      const response = await transport(parsed);
      const checked = codeRunResponseSchema.parse(response);
      if (checked.requestId !== parsed.requestId) {
        throw new Error("Sandbox transport answered a different requestId.");
      }
      return checked;
    },
  };
}

/** Canned sandbox for tests and demos: never executes anything. */
export function createFakeSandboxClient(result: Partial<Omit<CodeRunResponse, "requestId">> = {}): SandboxClient {
  return {
    async run(request) {
      const { requestId } = codeRunRequestSchema.parse(request);
      return codeRunResponseSchema.parse({
        requestId,
        status: "completed",
        stdout: "",
        stderr: "",
        exitCode: 0,
        truncated: false,
        durationMs: 0,
        ...result,
      });
    },
  };
}
