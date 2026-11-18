import type {
  LLMMessage,
  LLMProviderConfig,
  MemoryCandidate,
  MemoryItem,
} from "@pneuma/protocol";
import { createProvider, type LLMProvider } from "./llm-adapter";
import type { MemoryStore } from "./memory";
import { uid } from "./util";

/** 每积累多少条新消息触发一次提取 */
export const EXTRACT_EVERY = 20;
/** 单次最多提取条数 */
const MAX_PER_BATCH = 6;
/** 高于此置信度自动入库 */
const AUTO_ACCEPT = 0.78;

export interface ExtractResult {
  accepted: MemoryItem[];
  reinforced: MemoryItem[];
  pending: MemoryCandidate[];
}

export interface ExtractDeps {
  memory: MemoryStore;
  provider?: LLMProvider;
  config?: LLMProviderConfig;
}

interface ParsedFact {
  text: string;
  importance: number;
  confidence: number;
  emotion?: number;
}

function parseFacts(raw: string): ParsedFact[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1)) as unknown[];
    return arr
      .map((x) => {
        const o = x as Record<string, unknown>;
        return {
          text: String(o.text ?? "").trim(),
          importance: clamp(Number(o.importance ?? 0.5)),
          confidence: clamp(Number(o.confidence ?? 0.5)),
          emotion: o.emotion === undefined ? undefined : clamp(Number(o.emotion)),
        };
      })
      .filter((f) => f.text.length > 0)
      .slice(0, MAX_PER_BATCH);
  } catch {
    return [];
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

export class MemoryExtractor {
  private cursor = new Map<string, number>();

  constructor(public deps: ExtractDeps) {}

  restoreCursor(key: string, value: number): void {
    this.cursor.set(key, value);
  }

  cursorOf(key: string): number {
    return this.cursor.get(key) ?? 0;
  }

  shouldRun(key: string, historyLength: number): boolean {
    return historyLength - this.cursorOf(key) >= EXTRACT_EVERY;
  }

  async run(
    key: string,
    agentId: string,
    history: LLMMessage[],
  ): Promise<ExtractResult> {
    const from = this.cursorOf(key);
    const batch = history.slice(from);
    this.cursor.set(key, history.length);
    const result: ExtractResult = { accepted: [], reinforced: [], pending: [] };
    if (!batch.length) return result;

    const provider = this.deps.provider ?? createProvider(this.deps.config);
    const transcript = batch
      .map((m) => `${m.role === "user" ? "用户" : "角色"}：${m.content}`)
      .join("\n")
      .slice(-4000);
    const messages: LLMMessage[] = [
      {
        role: "system",
        content:
          '你是记忆提取器。从对话中抽取关于用户的长期事实（偏好/约定/身份/重要经历），忽略寒暄与一时情绪。只输出 JSON 数组，每项 {"text":"简明事实","importance":0-1,"confidence":0-1,"emotion":0-1}。最多 6 条，没有就输出 []。',
      },
      { role: "user", content: transcript },
    ];

    let raw = "";
    try {
      for await (const delta of provider.stream(messages, [])) {
        if (delta.type === "text") raw += delta.text;
      }
    } catch {
      return result;
    }

    for (const fact of parseFacts(raw)) {
      const conflict = this.deps.memory.findConflict(fact.text, agentId);
      if (conflict) {
        result.pending.push({
          id: uid(),
          agentId,
          text: fact.text,
          importance: fact.importance,
          confidence: fact.confidence,
          reason: "conflict",
          conflictWith: conflict.id,
          createdAt: Date.now(),
        });
        continue;
      }
      if (fact.confidence < AUTO_ACCEPT) {
        result.pending.push({
          id: uid(),
          agentId,
          text: fact.text,
          importance: fact.importance,
          confidence: fact.confidence,
          reason: "low-confidence",
          createdAt: Date.now(),
        });
        continue;
      }
      const { item, created } = this.deps.memory.addOrReinforce(
        "semantic",
        fact.text,
        fact.importance,
        agentId,
        { source: "auto", emotion: fact.emotion ?? 0.5 },
      );
      if (created) result.accepted.push(item);
      else result.reinforced.push(item);
    }
    return result;
  }
}