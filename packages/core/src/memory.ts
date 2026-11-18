import type { MemoryItem, MemoryKind, MemoryState } from "@pneuma/protocol";
import { uid } from "./util";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 强度半衰期（小时）：约一天半衰减到一半，情绪高的记得更久 */
const DECAY_HOURS = 36;
/** 新鲜期：期内以时间为主导，期后以情绪为主导 */
const FRESH_HOURS = 72;
/** 低于此强度进入 faded */
const FADE_THRESHOLD = 0.3;
/** faded 持续此时长后归档 */
const ARCHIVE_AFTER = 7 * DAY;
/** 归档条目需达到此相关度才可召回 */
const ARCHIVED_RECALL_MIN = 0.35;
/** 判定"同一件事"的相似度阈值 */
const DUP_THRESHOLD = 0.72;
/** 判定"可能冲突"的相似度区间下界 */
const CONFLICT_MIN = 0.35;

export function bigrams(text: string): Set<string> {
  const s = text.toLowerCase().replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (!out.size && s) out.add(s);
  return out;
}

export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

export class MemoryStore {
  private items: MemoryItem[] = [];

  add(
    kind: MemoryKind,
    text: string,
    importance = 0.5,
    pinned = false,
    agentId = "default",
    extra: Partial<MemoryItem> = {},
  ): MemoryItem {
    const item: MemoryItem = {
      id: uid(),
      agentId,
      kind,
      text,
      importance,
      createdAt: Date.now(),
      pinned,
      state: "active",
      activations: 0,
      emotion: 0.5,
      source: "tool",
      ...extra,
    };
    this.items.push(item);
    return item;
  }

  /** 写入前先查重：高度相似则强化既有记忆，返回 null 表示未新增 */
  addOrReinforce(
    kind: MemoryKind,
    text: string,
    importance = 0.5,
    agentId = "default",
    extra: Partial<MemoryItem> = {},
  ): { item: MemoryItem; created: boolean } {
    const dup = this.findSimilar(text, agentId, DUP_THRESHOLD);
    if (dup) {
      this.reinforce(dup.id);
      dup.importance = Math.min(1, Math.max(dup.importance, importance));
      return { item: dup, created: false };
    }
    return { item: this.add(kind, text, importance, false, agentId, extra), created: true };
  }

  findSimilar(
    text: string,
    agentId: string,
    min = DUP_THRESHOLD,
  ): MemoryItem | undefined {
    let best: MemoryItem | undefined;
    let bestScore = min;
    for (const item of this.items) {
      if (item.agentId !== agentId) continue;
      const s = similarity(item.text, text);
      if (s >= bestScore) {
        bestScore = s;
        best = item;
      }
    }
    return best;
  }

  /** 找出可能冲突的旧记忆（相似度中等区间） */
  findConflict(text: string, agentId: string): MemoryItem | undefined {
    let best: MemoryItem | undefined;
    let bestScore = CONFLICT_MIN;
    for (const item of this.items) {
      if (item.agentId !== agentId) continue;
      const s = similarity(item.text, text);
      if (s >= bestScore && s < DUP_THRESHOLD) {
        bestScore = s;
        best = item;
      }
    }
    return best;
  }

  reinforce(id: string, now = Date.now()): MemoryItem | undefined {
    const item = this.items.find((i) => i.id === id);
    if (!item) return undefined;
    item.activations = (item.activations ?? 0) + 1;
    item.lastActivatedAt = now;
    if (item.state !== "active" && !item.pinned) {
      item.state = "active";
      item.fadedAt = undefined;
    }
    return item;
  }

  all(): MemoryItem[] {
    return [...this.items];
  }

  restore(items: MemoryItem[]): void {
    this.items = items.map((i) => ({
      state: "active",
      activations: 0,
      emotion: 0.5,
      ...i,
    }));
  }

  revise(id: string, text: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;
    item.text = text;
    item.state = "active";
    item.fadedAt = undefined;
    return true;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    return this.items.length < before;
  }

  /** 记忆强度：时间指数衰减与情绪加权 + 重要性 + 激活加成 */
  strength(item: MemoryItem, now = Date.now()): number {
    if (item.pinned) return 1;
    const hours = Math.max(0, now - item.createdAt) / HOUR;
    const decay = Math.exp(-hours / DECAY_HOURS);
    const emotion = item.emotion ?? 0.5;
    const base =
      hours <= FRESH_HOURS
        ? decay * 0.7 + emotion * 0.3
        : decay * 0.3 + emotion * 0.7;
    const activationBonus = Math.min(
      0.24,
      Math.log1p(item.activations ?? 0) * 0.08,
    );
    return Math.min(1, base * 0.68 + item.importance * 0.32 + activationBonus);
  }

  /** 生命周期推进：低强度转 faded，长期 faded 转 archived */
  tick(now = Date.now()): MemoryItem[] {
    const changed: MemoryItem[] = [];
    for (const item of this.items) {
      if (item.pinned) continue;
      const state: MemoryState = item.state ?? "active";
      if (state === "archived") continue;
      const s = this.strength(item, now);
      if (state === "active" && s < FADE_THRESHOLD) {
        item.state = "faded";
        item.fadedAt = now;
        changed.push(item);
      } else if (
        state === "faded" &&
        item.fadedAt &&
        now - item.fadedAt >= ARCHIVE_AFTER
      ) {
        item.state = "archived";
        changed.push(item);
      }
    }
    return changed;
  }

  score(item: MemoryItem, query: string, now = Date.now()): number {
    const q = query.trim();
    const relevance = q ? similarity(item.text, q) : 0.2;
    const recency = 1 / (1 + (now - item.createdAt) / HOUR);
    return (
      (item.pinned ? 3 : 0) +
      relevance * 4 +
      this.strength(item, now) * 2 +
      item.importance +
      recency * 1.5
    );
  }

  retrieve(
    query: string,
    limit: number,
    now = Date.now(),
    agentId?: string,
  ): MemoryItem[] {
    this.tick(now);
    const pool = this.items.filter((item) => {
      if (agentId && item.agentId !== agentId) return false;
      if (item.pinned) return true;
      if ((item.state ?? "active") !== "archived") return true;
      return query.trim()
        ? similarity(item.text, query) >= ARCHIVED_RECALL_MIN
        : false;
    });
    const pinned = pool.filter((i) => i.pinned);
    const rest = pool
      .filter((i) => !i.pinned)
      .sort((a, b) => this.score(b, query, now) - this.score(a, query, now));
    const picked = [...pinned, ...rest].slice(0, limit);
    for (const item of picked) {
      if (!item.pinned) this.reinforce(item.id, now);
    }
    return picked;
  }
}