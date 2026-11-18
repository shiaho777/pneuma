import type { AgentDefinition } from "@pneuma/protocol";

export interface SpeakerDecision {
  agentId: string;
  speak: boolean;
  reason: string;
}

export interface ScheduleOptions {
  maxSpeakers?: number;
  lastSpeakerId?: string;
}

export function scheduleSpeakers(
  participants: AgentDefinition[],
  userText: string,
  statusMap: Record<string, string> = {},
  options: ScheduleOptions = {},
): SpeakerDecision[] {
  const max = options.maxSpeakers ?? 2;
  const decisions: SpeakerDecision[] = participants.map((agent) => {
    if (userText.includes(agent.name)) {
      return { agentId: agent.id, speak: true, reason: "被用户提及" };
    }
    const status = statusMap[agent.id] ?? "";
    const words = userText
      .split(/[\s，。！？、,.!?]+/)
      .filter((w) => w.length >= 2);
    const hit = words.find((w) => status.includes(w));
    if (hit) {
      return { agentId: agent.id, speak: true, reason: `状态与「${hit}」相关` };
    }
    return { agentId: agent.id, speak: false, reason: "本轮未被提及，保持沉默" };
  });

  let speakers = decisions.filter((d) => d.speak);
  if (speakers.length === 0 && participants.length > 0) {
    const fallback =
      participants.find((p) => p.id !== options.lastSpeakerId) ??
      participants[0];
    const d = decisions.find((x) => x.agentId === fallback.id)!;
    d.speak = true;
    d.reason = "无人被提及，轮值发言";
    speakers = [d];
  }
  if (speakers.length > max) {
    for (const d of speakers.slice(max)) {
      d.speak = false;
      d.reason = `本轮发言上限 ${max}，保持沉默`;
    }
  }
  return decisions;
}