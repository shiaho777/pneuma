import type { LLMMessage, LoreEntry, PromptLayerId } from "@pneuma/protocol";

export interface LoreScanOptions {
  depth?: number;
  charBudget?: number;
  sessionId?: string;
  turn?: number;
}

export interface LoreHit {
  entry: LoreEntry;
  position: PromptLayerId;
  reason: string;
}

/** 确定性哈希：同一会话+条目+轮次结果稳定，便于复现与测试 */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function hitKeys(entry: LoreEntry, text: string): boolean {
  const lower = text.toLowerCase();
  const primary = (entry.keys ?? []).filter(Boolean);
  if (!primary.length) return false;
  if (!primary.some((k) => lower.includes(k.toLowerCase()))) return false;
  const secondary = (entry.secondaryKeys ?? []).filter(Boolean);
  if (!secondary.length) return true;
  const matches = secondary.filter((k) => lower.includes(k.toLowerCase()));
  return entry.secondaryMode === "and"
    ? matches.length === secondary.length
    : matches.length > 0;
}

/** 特异度：关键词越长越具体，优先级更高 */
function specificity(entry: LoreEntry): number {
  return (entry.keys ?? []).reduce((n, k) => n + k.length, 0);
}

export function scanLore(
  entries: LoreEntry[],
  history: LLMMessage[],
  options: LoreScanOptions = {},
): LoreHit[] {
  const depth = options.depth ?? 20;
  const budget = options.charBudget ?? 3000;
  const window = history
    .slice(-depth)
    .map((m) => m.content)
    .join("\n");
  const seedBase = `${options.sessionId ?? "s"}:${options.turn ?? 0}`;

  const candidates: LoreHit[] = [];
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    const position = (entry.position ?? "scene") as PromptLayerId;
    if (entry.constant) {
      candidates.push({ entry, position, reason: "常驻" });
      continue;
    }
    if (!hitKeys(entry, window)) continue;
    const probability = entry.probability ?? 100;
    if (probability < 100) {
      const roll = hashSeed(`${seedBase}:${entry.id}`) * 100;
      if (roll >= probability) continue;
    }
    candidates.push({ entry, position, reason: "关键词命中" });
  }

  candidates.sort((a, b) => {
    const pa = a.entry.priority ?? 0;
    const pb = b.entry.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return specificity(b.entry) - specificity(a.entry);
  });

  const hits: LoreHit[] = [];
  let used = 0;
  for (const hit of candidates) {
    const size = hit.entry.content.length;
    if (used + size > budget && hits.length > 0) continue;
    hits.push(hit);
    used += size;
    if (used >= budget) break;
  }
  return hits;
}

export function loreFor(hits: LoreHit[], position: PromptLayerId): string {
  return hits
    .filter((h) => h.position === position)
    .map((h) => h.entry.content)
    .join("\n");
}