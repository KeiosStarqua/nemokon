import { z } from "zod";

/** One inbound user message handed to the agent. Channel-agnostic. */
export const agentTurnRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(8000),
  /** Optional id from the caller, echoed back in logs. */
  messageId: z.string().trim().min(1).max(200).optional(),
});
export type AgentTurnRequest = z.infer<typeof agentTurnRequestSchema>;

export const agentTurnResponseSchema = z.object({
  replyText: z.string().min(1),
  modelId: z.string().min(1),
});
export type AgentTurnResponse = z.infer<typeof agentTurnResponseSchema>;

export const agentTurnErrorSchema = z.object({
  error: z.string().min(1),
});
export type AgentTurnError = z.infer<typeof agentTurnErrorSchema>;

/** Key under which the agent runtime puts the current conversation id in Mastra's request context. */
export const CONVERSATION_ID_CONTEXT_KEY = "conversationId";
