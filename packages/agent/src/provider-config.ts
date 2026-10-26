/**
 * One provider, one key from the environment: Nebius Token Factory speaks the OpenAI chat
 * completions protocol, so Mastra's OpenAI-compatible model config is all we need.
 */

export const NEBIUS_DEFAULT_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
/** A Nemotron model on Token Factory. Override with `NEBIUS_MODEL`; copy ids from the Token Factory Models page. */
export const NEBIUS_DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

export type NebiusProviderConfig = {
  apiKey: string;
  modelId: string;
  baseUrl: string;
};

export class MissingNebiusKeyError extends Error {
  constructor() {
    super("NEBIUS_API_KEY is not set. Create a key in Nebius Token Factory and export it (see .env.example).");
    this.name = "MissingNebiusKeyError";
  }
}

export type EnvLike = Record<string, string | undefined>;

/** Reads `NEBIUS_API_KEY`, `NEBIUS_MODEL` and `NEBIUS_BASE_URL`. Throws `MissingNebiusKeyError` without a key. */
export function loadNebiusConfig(env: EnvLike = process.env, overrides: { modelId?: string } = {}): NebiusProviderConfig {
  const apiKey = env.NEBIUS_API_KEY?.trim();
  if (!apiKey) throw new MissingNebiusKeyError();
  return {
    apiKey,
    modelId: overrides.modelId?.trim() || env.NEBIUS_MODEL?.trim() || NEBIUS_DEFAULT_MODEL,
    baseUrl: env.NEBIUS_BASE_URL?.trim() || NEBIUS_DEFAULT_BASE_URL,
  };
}

/** Mastra OpenAI-compatible model config for Token Factory. */
export function toMastraModel(config: NebiusProviderConfig) {
  return {
    providerId: "nebius",
    modelId: config.modelId,
    url: config.baseUrl,
    apiKey: config.apiKey,
    api: "chat",
  } as const;
}
