import type { WorldEvent } from "@pneuma/protocol";
import { uid } from "./util";

export class EventBus {
  private events: WorldEvent[] = [];
  private subscriptions = new Map<string, Set<string>>();

  subscribe(agentId: string, otherId: string): void {
    const set = this.subscriptions.get(agentId) ?? new Set<string>();
    set.add(otherId);
    this.subscriptions.set(agentId, set);
  }

  unsubscribe(agentId: string, otherId: string): void {
    this.subscriptions.get(agentId)?.delete(otherId);
  }

  subscribersOf(actorId: string): string[] {
    const result: string[] = [];
    for (const [subscriber, set] of this.subscriptions) {
      if (set.has(actorId)) result.push(subscriber);
    }
    return result;
  }

  publish(
    event: Omit<WorldEvent, "id" | "createdAt">,
  ): WorldEvent {
    const full: WorldEvent = { ...event, id: uid(), createdAt: Date.now() };
    this.events.push(full);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    return full;
  }

  relevantFor(agentId: string, limit = 5): WorldEvent[] {
    const subs = this.subscriptions.get(agentId) ?? new Set<string>();
    return this.events
      .filter((e) => e.actorId !== agentId && subs.has(e.actorId))
      .slice(-limit);
  }

  subscriptionTargets(agentId: string): string[] {
    return [...(this.subscriptions.get(agentId) ?? [])];
  }
}