import { serve } from "@hono/node-server";
import {
  MissingNebiusKeyError,
  createNemokonAgent,
  loadExecutionLimits,
  loadNebiusConfig,
  runAgentTurn,
} from "@nemokon/agent";
import { createStdoutChannel } from "@nemokon/channel";
import { createConversationMemory } from "@nemokon/memory";
import {
  createInMemoryNoteStore,
  createInMemoryScheduleStore,
  createInMemoryTaskStore,
  createNemokonTools,
  createWebSearchProviderFromEnv,
} from "@nemokon/tools";
import { createApp } from "./app";
import { loadConfig, loadInstructions, modelForTask, resolvePath } from "./config";
import { seedSampleData } from "./sample-data";
import { resolveServerOptions } from "./server-options";

// Optional local .env (Node >= 20.12). Real environment variables win.
try {
  process.loadEnvFile?.(resolvePath("apps/demo/.env"));
} catch {
  // no .env file: fine
}

let serverOptions;
try {
  serverOptions = resolveServerOptions(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const config = loadConfig(process.env.NEMOKON_CONFIG ?? "config.example.yaml");

let provider;
try {
  provider = loadNebiusConfig(process.env, { modelId: config.models.chat ?? undefined });
} catch (error) {
  if (error instanceof MissingNebiusKeyError) {
    console.error(`${error.message}\nCopy apps/demo/.env.example to apps/demo/.env and fill NEBIUS_API_KEY.`);
    process.exit(1);
  }
  throw error;
}
console.log(`model: ${modelForTask(config, "chat", provider.modelId)} @ ${provider.baseUrl}`);

const tasks = createInMemoryTaskStore();
const notes = createInMemoryNoteStore();
if (config.sample_data.enabled) {
  const seeded = await seedSampleData({
    dir: config.sample_data.dir,
    conversationId: config.sample_data.conversation_id,
    tasks,
    notes,
  });
  console.log(`seeded sample data for conversation "${config.sample_data.conversation_id}":`, seeded);
}

const webSearch = config.tools.web_search === "auto" ? createWebSearchProviderFromEnv() : undefined;
const agent = createNemokonAgent({
  instructions: loadInstructions(config),
  provider,
  memory: createConversationMemory({ libsqlUrl: config.memory.libsql_url, lastMessages: config.memory.last_messages }),
  tools: createNemokonTools({
    channel: createStdoutChannel(),
    tasks,
    notes,
    schedules: createInMemoryScheduleStore(),
    webSearch,
  }),
});

const limits = loadExecutionLimits(process.env, {
  maxToolRounds: config.limits.max_tool_rounds,
  maxTokens: config.limits.max_tokens,
  timeoutMs: config.limits.timeout_ms,
});

const app = createApp({
  token: serverOptions.token,
  runTurn: (request) => runAgentTurn(agent, request, { modelId: provider.modelId, limits }),
  onError: (error) => console.error("turn failed:", error instanceof Error ? error.message : error),
});

// Binds HOST (default 127.0.0.1). A non-loopback HOST requires DEMO_TOKEN (checked above) and TLS in front.
const { hostname, port } = serverOptions;
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`nemokon demo on http://${hostname}:${info.port}  (POST /turn, GET /health)`);
});

// Graceful stop: let in-flight requests finish, but never hang longer than 10 s.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.log(`${signal}: shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => process.exit(0));
  });
}
