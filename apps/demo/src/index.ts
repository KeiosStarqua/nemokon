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

// Optional local .env (Node >= 20.12). Real environment variables win.
try {
  process.loadEnvFile?.(resolvePath("apps/demo/.env"));
} catch {
  // no .env file: fine
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
  token: process.env.DEMO_TOKEN?.trim() || undefined,
  runTurn: (request) => runAgentTurn(agent, request, { modelId: provider.modelId, limits }),
  onError: (error) => console.error("turn failed:", error instanceof Error ? error.message : error),
});

// Loopback only: this demo is not meant to be exposed to a network.
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`nemokon demo on http://127.0.0.1:${info.port}  (POST /turn, GET /health)`);
});
