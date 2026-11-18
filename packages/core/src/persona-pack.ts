import type { AgentDefinition, PersonaPack } from "@pneuma/protocol";
import { uid } from "./util";

export function buildPersonaPack(
  agent: AgentDefinition,
  memorySeed: { text: string; importance: number }[],
  firstMes?: string,
): PersonaPack {
  return {
    format: "pneuma-persona",
    formatVersion: 1,
    agent,
    memorySeed,
    firstMes,
    exportedAt: Date.now(),
  };
}

export function parsePersonaPack(json: unknown): PersonaPack {
  const pack = json as PersonaPack;
  if (
    !pack ||
    typeof pack !== "object" ||
    pack.format !== "pneuma-persona" ||
    pack.formatVersion !== 1 ||
    !pack.agent ||
    typeof pack.agent.name !== "string" ||
    typeof pack.agent.persona !== "string" ||
    !Array.isArray(pack.agent.tools)
  ) {
    throw new Error("不是有效的 Pneuma 人格包（format/formatVersion/agent 校验失败）");
  }
  if (!Array.isArray(pack.memorySeed)) pack.memorySeed = [];
  return pack;
}

export function agentFromPack(pack: PersonaPack): AgentDefinition {
  return { ...pack.agent, id: "pack-" + uid() };
}