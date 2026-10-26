import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/* ---- Port ---- */

export type WebSearchResult = { title: string; url: string; snippet: string };

export type WebSearchProvider = {
  readonly name: string;
  search(query: string, options?: { limit?: number }): Promise<WebSearchResult[]>;
};

/* ---- Tavily adapter (plain REST, no SDK). Optional: needs TAVILY_API_KEY. ---- */

export function createTavilyProvider(options: { apiKey: string; fetch?: typeof fetch; baseUrl?: string }): WebSearchProvider {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.tavily.com").replace(/\/+$/, "");
  return {
    name: "tavily",
    async search(query, { limit = 5 } = {}) {
      const response = await fetchImpl(`${baseUrl}/search`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ query, max_results: limit }),
      });
      if (!response.ok) throw new Error(`Web search failed with HTTP ${response.status}.`);
      const data = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      return (data.results ?? [])
        .filter((r): r is { title?: string; url: string; content?: string } => typeof r.url === "string")
        .map((r) => ({ title: r.title ?? r.url, url: r.url, snippet: (r.content ?? "").slice(0, 500) }));
    },
  };
}

/** Returns a Tavily provider when `TAVILY_API_KEY` is set, otherwise `undefined` (the tool is then left out). */
export function createWebSearchProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): WebSearchProvider | undefined {
  const apiKey = env.TAVILY_API_KEY?.trim();
  return apiKey ? createTavilyProvider({ apiKey }) : undefined;
}

export function createWebSearchTool(provider: WebSearchProvider) {
  return createTool({
    id: "webSearch",
    description: "Search the web for current information. Cite the URLs you rely on.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(300),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    execute: async ({ query, limit }) => {
      try {
        return { results: await provider.search(query, { limit }) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Web search failed." };
      }
    },
  });
}
