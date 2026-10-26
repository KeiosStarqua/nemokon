import { Agent } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import { RequestContext } from "@mastra/core/request-context";
import { CONVERSATION_ID_CONTEXT_KEY, type AgentTurnRequest, type AgentTurnResponse } from "@nemokon/contracts";
import { DEFAULT_EXECUTION_LIMITS, type ExecutionLimits } from "./execution-limits";
import { toMastraModel, type NebiusProviderConfig } from "./provider-config";

export type NemokonAgentOptions = {
  /** Mastra agent id. */
  id?: string;
  /** System prompt text. Load it from a file or from config; see `prompts/`. */
  instructions: string;
  provider: NebiusProviderConfig;
  /** Mastra tools, keyed by tool id. See `@nemokon/tools`. */
  tools?: ConstructorParameters<typeof Agent>[0]["tools"];
  /** Conversation memory. See `@nemokon/memory`. */
  memory?: MastraMemory;
};

export const NEMOKON_AGENT_ID = "nemokon-assistant";

/** Builds a Mastra agent that talks to Nebius Token Factory. */
export function createNemokonAgent(options: NemokonAgentOptions) {
  return new Agent({
    id: options.id ?? NEMOKON_AGENT_ID,
    name: options.id ?? NEMOKON_AGENT_ID,
    instructions: options.instructions,
    model: toMastraModel(options.provider),
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.memory ? { memory: options.memory } : {}),
  });
}

export type NemokonAgent = ReturnType<typeof createNemokonAgent>;

/**
 * Runs one turn. The conversation id becomes the memory thread and resource, and is also put in the
 * request context so tools act on the current conversation only.
 */
export async function runAgentTurn(
  agent: NemokonAgent,
  request: AgentTurnRequest,
  options: { modelId: string; limits?: ExecutionLimits },
): Promise<AgentTurnResponse> {
  const limits = options.limits ?? DEFAULT_EXECUTION_LIMITS;
  const requestContext = new RequestContext();
  requestContext.set(CONVERSATION_ID_CONTEXT_KEY, request.conversationId);

  const result = await agent.generate(request.text, {
    maxSteps: limits.maxToolRounds,
    requestContext,
    memory: { thread: request.conversationId, resource: request.conversationId },
    ...(limits.maxTokens ? { modelSettings: { maxOutputTokens: limits.maxTokens } } : {}),
    ...(limits.timeoutMs ? { abortSignal: AbortSignal.timeout(limits.timeoutMs) } : {}),
  });

  const replyText = result.text.trim();
  if (!replyText) throw new Error("The model returned an empty reply.");
  return { replyText, modelId: options.modelId };
}
