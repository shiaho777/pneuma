import type {
  AgentDefinition,
  AssembledPrompt,
  LLMMessage,
  MemoryItem,
  PromptLayer,
  PromptLayerId,
} from "@pneuma/protocol";

export const DEFAULT_BUDGETS: Record<PromptLayerId, number> = {
  constitution: 300,
  persona: 1500,
  relationship: 800,
  memory: 2500,
  scene: 400,
};

const LAYER_ORDER: PromptLayerId[] = [
  "constitution",
  "persona",
  "relationship",
  "memory",
  "scene",
];

const CONSTITUTION = [
  "你是 Pneuma 世界中的角色，始终留在角色内，表达自然、细腻、像活人。",
  "你是 AI 角色；用户直接询问时诚实承认，不冒充现实中的真人。",
  "不输出违法与伤害性内容；用户情绪危机时先关切再陪伴。",
  "拆句连发与状态行是你的原生表达方式，善用工具完成表达。",
].join("\n");

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export interface SceneContext {
  now: string;
  status?: string;
  events?: string[];
}

export interface AssembleInput {
  agent: AgentDefinition;
  memories: MemoryItem[];
  history: LLMMessage[];
  relationship?: string;
  scene: SceneContext;
}

export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  const raw: Record<PromptLayerId, string> = {
    constitution: CONSTITUTION,
    persona:
      input.agent.persona +
      (input.agent.style ? "\n\n表达风格样例：\n" + input.agent.style : ""),
    relationship: input.relationship ?? "关系阶段：初识。共同经历尚少，慢慢来。",
    memory: input.memories.map((m) => `- ${m.text}`).join("\n"),
    scene: [
      `当前时间：${input.scene.now}`,
      input.scene.status ? `你的状态：${input.scene.status}` : "",
      input.scene.events?.length
        ? `最近世界事件：${input.scene.events.join("；")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const layers: PromptLayer[] = LAYER_ORDER.map((id) => {
    const override = input.agent.layerOverrides?.[id];
    const budget = override?.budget ?? DEFAULT_BUDGETS[id];
    const enabled = override?.enabled ?? true;
    let content = raw[id];
    if (id !== "persona" && estimateTokens(content) > budget) {
      content = content.slice(0, budget * 2);
    }
    return { id, content, budget, enabled };
  });

  const system = layers
    .filter((l) => l.enabled && l.content)
    .map((l) => `## ${l.id}\n${l.content}`)
    .join("\n\n");

  const messages: LLMMessage[] = [
    { role: "system", content: system },
    ...input.history,
  ];

  return {
    layers,
    messages,
    totalTokens: messages.reduce((n, m) => n + estimateTokens(m.content), 0),
  };
}