import type {
  CatalogProvider,
  ModelCatalog,
  ModelSpec,
} from "@pneuma/protocol";

let catalog: ModelCatalog | null = null;

export function setCatalog(next: ModelCatalog): void {
  catalog = next;
}

export function getCatalog(): ModelCatalog | null {
  return catalog;
}

export interface CatalogMatch {
  provider: CatalogProvider;
  model: ModelSpec;
}

export function findModelMatches(modelId: string, limit = 8): CatalogMatch[] {
  if (!catalog || !modelId.trim()) return [];
  const q = modelId.trim().toLowerCase();
  const matches: CatalogMatch[] = [];
  for (const provider of catalog.providers) {
    for (const model of provider.models) {
      if (model.id.toLowerCase() === q) {
        matches.push({ provider, model });
      }
    }
  }
  if (matches.length) return matches.slice(0, limit);
  for (const provider of catalog.providers) {
    for (const model of provider.models) {
      if (model.id.toLowerCase().includes(q)) {
        matches.push({ provider, model });
        if (matches.length >= limit) return matches;
      }
    }
  }
  return matches;
}

export function findProvider(id: string): CatalogProvider | undefined {
  return catalog?.providers.find((p) => p.id === id);
}

export function listProviders(): CatalogProvider[] {
  return catalog?.providers ?? [];
}

export const POPULAR_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "amazon-bedrock",
  "deepseek",
  "siliconflow",
  "zhipuai",
  "moonshotai",
  "minimax",
  "xiaomi",
  "alibaba",
  "volcengine",
  "openrouter",
  "groq",
  "mistral",
  "xai",
  "togetherai",
  "cerebras",
  "perplexity",
  "cohere",
  "huggingface",
];

export function listPopularProviders(): CatalogProvider[] {
  if (!catalog) return [];
  const byId = new Map(catalog.providers.map((p) => [p.id, p]));
  const popular = POPULAR_PROVIDER_IDS.map((id) => byId.get(id)).filter(
    (p): p is CatalogProvider => Boolean(p),
  );
  return popular.length ? popular : catalog.providers.slice(0, 24);
}

export function providerModels(providerId: string): ModelSpec[] {
  return findProvider(providerId)?.models ?? [];
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}