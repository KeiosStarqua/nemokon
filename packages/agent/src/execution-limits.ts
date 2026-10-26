export type ExecutionLimits = {
  /** Most model steps (model call + tool calls) in one turn. */
  maxToolRounds: number;
  /** Cap on output tokens per model call. */
  maxTokens?: number;
  /** Wall-clock budget of one turn. */
  timeoutMs?: number;
};

export const DEFAULT_EXECUTION_LIMITS: ExecutionLimits = {
  maxToolRounds: 8,
  maxTokens: 1024,
  timeoutMs: 60_000,
};

export class ToolRoundLimitError extends Error {
  constructor(limit: number) {
    super(`Tool round limit exceeded (${limit})`);
    this.name = "ToolRoundLimitError";
  }
}

export function assertWithinToolRoundLimit(used: number, limits: ExecutionLimits): void {
  if (used >= limits.maxToolRounds) throw new ToolRoundLimitError(limits.maxToolRounds);
}

/** Reads `AGENT_MAX_STEPS`, `AGENT_MAX_TOKENS`, `AGENT_TIMEOUT_MS`; falls back to the defaults. */
export function loadExecutionLimits(
  env: Record<string, string | undefined> = process.env,
  base: ExecutionLimits = DEFAULT_EXECUTION_LIMITS,
): ExecutionLimits {
  const int = (raw: string | undefined, fallback: number | undefined, min: number, max: number) => {
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) return fallback;
    return n;
  };
  return {
    maxToolRounds: int(env.AGENT_MAX_STEPS, base.maxToolRounds, 1, 25) ?? base.maxToolRounds,
    maxTokens: int(env.AGENT_MAX_TOKENS, base.maxTokens, 16, 32_000),
    timeoutMs: int(env.AGENT_TIMEOUT_MS, base.timeoutMs, 1_000, 600_000),
  };
}
