import { CONVERSATION_ID_CONTEXT_KEY } from "@nemokon/contracts";

type ContextLike = { requestContext?: { get(key: string): unknown } } | undefined;

/** The conversation the current turn belongs to, set by `runAgentTurn`. Tools never take it from the model. */
export function conversationIdFrom(context: ContextLike): string | undefined {
  const value = context?.requestContext?.get(CONVERSATION_ID_CONTEXT_KEY);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const NO_CONVERSATION_ERROR = { error: "No conversation is bound to this turn." } as const;
