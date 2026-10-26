import { timingSafeEqual } from "node:crypto";
import { agentTurnRequestSchema, type AgentTurnRequest, type AgentTurnResponse } from "@nemokon/contracts";
import { Hono } from "hono";

export type RunTurn = (request: AgentTurnRequest) => Promise<AgentTurnResponse>;

export type AppOptions = {
  runTurn: RunTurn;
  /** When set, `POST /turn` needs `Authorization: Bearer <token>`. */
  token?: string;
  /** Reports an unexpected error (the response stays generic). */
  onError?: (error: unknown) => void;
};

function tokenMatches(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Thin Hono server: `POST /turn {conversationId,text}` -> `{replyText,modelId}`. */
export function createApp(options: AppOptions) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.post("/turn", async (c) => {
    if (options.token && !tokenMatches(c.req.header("authorization"), options.token)) {
      return c.json({ error: "Unauthorized." }, 401);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Body must be JSON." }, 400);
    }
    const parsed = agentTurnRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") }, 400);
    }
    try {
      return c.json(await options.runTurn(parsed.data));
    } catch (error) {
      options.onError?.(error);
      return c.json({ error: "The assistant could not answer. Check the server log." }, 502);
    }
  });

  return app;
}
