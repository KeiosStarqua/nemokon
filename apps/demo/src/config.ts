import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

/** Repo root: apps/demo/src -> three levels up. Relative paths in the config resolve against it. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const nullableModel = z.string().trim().min(1).nullable().default(null);

export const configSchema = z.object({
  assistant: z.object({
    name: z.string().trim().min(1).default("Sample Assistant"),
    tone: z.string().trim().min(1).default("friendly and concise"),
    language: z.string().trim().min(1).default("en"),
    timezone: z.string().trim().min(1).default("UTC"),
  }),
  prompt_file: z.string().trim().min(1).default("prompts/personal-assistant.example.md"),
  models: z
    .object({ chat: nullableModel, planning: nullableModel, summarize: nullableModel })
    .default({ chat: null, planning: null, summarize: null }),
  limits: z
    .object({
      max_tool_rounds: z.number().int().min(1).max(25).default(8),
      max_tokens: z.number().int().min(16).max(32_000).default(1024),
      timeout_ms: z.number().int().min(1000).max(600_000).default(60_000),
    })
    .default({ max_tool_rounds: 8, max_tokens: 1024, timeout_ms: 60_000 }),
  memory: z
    .object({
      libsql_url: z.string().trim().min(1).default("file:./mastra.db"),
      last_messages: z.number().int().min(1).max(200).default(20),
    })
    .default({ libsql_url: "file:./mastra.db", last_messages: 20 }),
  tools: z.object({ web_search: z.enum(["auto", "off"]).default("auto") }).default({ web_search: "auto" }),
  sample_data: z
    .object({
      enabled: z.boolean().default(false),
      dir: z.string().trim().min(1).default("data/sample"),
      conversation_id: z.string().trim().min(1).default("demo"),
    })
    .default({ enabled: false, dir: "data/sample", conversation_id: "demo" }),
});

export type NemokonConfig = z.infer<typeof configSchema>;

/** Model tasks the config can route. `chat` serves `POST /turn`; the others are for your own code. */
export type ModelTask = keyof NemokonConfig["models"];

export function resolvePath(path: string, root: string = REPO_ROOT): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

export function parseConfig(yamlText: string): NemokonConfig {
  return configSchema.parse(parse(yamlText) ?? {});
}

export function loadConfig(path: string): NemokonConfig {
  return parseConfig(readFileSync(resolvePath(path), "utf8"));
}

/** Model id for a task: the config value, else `fallback` (normally `NEBIUS_MODEL`). */
export function modelForTask(config: NemokonConfig, task: ModelTask, fallback: string): string {
  return config.models[task] ?? fallback;
}

/** Fills `{{name}}`-style placeholders. Unknown placeholders are left as is. */
export function renderPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match).trim();
}

export function loadInstructions(config: NemokonConfig): string {
  const template = readFileSync(resolvePath(config.prompt_file), "utf8");
  const { name, tone, language, timezone } = config.assistant;
  return renderPrompt(template, { name, tone, language, timezone });
}
