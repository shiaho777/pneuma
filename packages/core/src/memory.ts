import type { MemoryItem, MemoryKind } from "@pneuma/protocol";
import { uid } from "./util";

export class MemoryStore {
  private items: MemoryItem[] = [];

  add(
    kind: MemoryKind,
    text: string,
    importance = 0.5,
    pinned = false,
    agentId = "default",
  ): MemoryItem {
    const item: MemoryItem = {
      id: uid(),
      agentId,
      kind,
      text,
      importance,
      createdAt: Date.now(),
      pinned,
    };
    this.items.push(item);
    return item;
  }

  all(): MemoryItem[] {
    return [...this.items];
  }

  restore(items: MemoryItem[]): void {
    this.items = [...items];
  }

  revise(id: string, text: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item) return false;
    item.text = text;
    return true;
  }

  score(item: MemoryItem, query: string, now = Date.now()): number {
    const recency = 1 / (1 + (now - item.createdAt) / 3_600_000);
    const q = query.trim();
    const relevance =
      q && (item.text.includes(q) || q.includes(item.text)) ? 1 : 0.2;
    return item.importance * 0.5 + recency * 0.25 + relevance * 0.25;
  }

  retrieve(query: string, limit: number, now = Date.now()): MemoryItem[] {
    const pinned = this.items.filter((i) => i.pinned);
    const rest = this.items
      .filter((i) => !i.pinned)
      .sort((a, b) => this.score(b, query, now) - this.score(a, query, now));
    return [...pinned, ...rest].slice(0, limit);
  }
}