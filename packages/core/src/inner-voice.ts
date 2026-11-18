import type { InnerState } from "@pneuma/protocol";

export class InnerVoiceStore {
  private states = new Map<string, InnerState>();

  set(agentId: string, patch: Partial<InnerState>): InnerState {
    const prev = this.states.get(agentId);
    const next: InnerState = {
      emotion: patch.emotion ?? prev?.emotion,
      concern: patch.concern ?? prev?.concern,
      pendingIntent: patch.pendingIntent ?? prev?.pendingIntent,
      updatedAt: Date.now(),
    };
    this.states.set(agentId, next);
    return next;
  }

  get(agentId: string): InnerState | undefined {
    return this.states.get(agentId);
  }

  clearIntent(agentId: string): void {
    const prev = this.states.get(agentId);
    if (prev) this.states.set(agentId, { ...prev, pendingIntent: undefined, updatedAt: Date.now() });
  }

  restore(entries: [string, InnerState][]): void {
    this.states = new Map(entries);
  }

  all(): [string, InnerState][] {
    return [...this.states.entries()];
  }

  /** 注入下一轮的轻量心理状态；无内容返回空串 */
  render(agentId: string): string {
    const s = this.states.get(agentId);
    if (!s) return "";
    const parts = [
      s.emotion ? `此刻情绪：${s.emotion}` : "",
      s.concern ? `心里挂着：${s.concern}` : "",
      s.pendingIntent ? `还没说出口的打算：${s.pendingIntent}` : "",
    ].filter(Boolean);
    return parts.length ? `（上一轮的内心延续）${parts.join("；")}` : "";
  }
}