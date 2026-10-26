# @nemokon/agent

- `loadNebiusConfig(env)`: reads `NEBIUS_API_KEY`, `NEBIUS_MODEL`, `NEBIUS_BASE_URL` (default `https://api.tokenfactory.nebius.com/v1/`).
- `createNemokonAgent({ instructions, provider, tools?, memory? })`: Mastra agent using Mastra's OpenAI-compatible model config.
- `runAgentTurn(agent, request, { modelId, limits })`: one turn; conversation id becomes the memory thread and the tools' request context.
- `ExecutionLimits` / `loadExecutionLimits(env)`: step, token and time caps (`AGENT_MAX_STEPS`, `AGENT_MAX_TOKENS`, `AGENT_TIMEOUT_MS`).
