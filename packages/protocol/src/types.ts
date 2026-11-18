export type Role = "user" | "assistant" | "system";

export interface LLMMessage {
  role: Role;
  content: string;
}

export type PromptLayerId =
  | "constitution"
  | "persona"
  | "relationship"
  | "memory"
  | "scene";

export interface PromptLayer {
  id: PromptLayerId;
  content: string;
  budget: number;
  enabled: boolean;
}

export interface AssembledPrompt {
  layers: PromptLayer[];
  messages: LLMMessage[];
  totalTokens: number;
}

export type MemoryKind = "working" | "episodic" | "semantic" | "relationship";

export interface MemoryItem {
  id: string;
  agentId: string;
  kind: MemoryKind;
  text: string;
  importance: number;
  createdAt: number;
  pinned?: boolean;
}

export type ToolGroup = "expression" | "life" | "memory" | "care" | "social";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  group: ToolGroup;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  ok: boolean;
  output: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  avatar?: string;
  persona: string;
  style?: string;
  tools: string[];
  layerOverrides?: Partial<
    Record<PromptLayerId, { enabled?: boolean; budget?: number }>
  >;
  modelBinding?: string;
}

export interface Session {
  id: string;
  participantIds: string[];
  title: string;
  createdAt: number;
}

export type ChatMessageKind = "text" | "sticker" | "status" | "voice" | "photo";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  agentId?: string;
  content: string;
  createdAt: number;
  kind?: ChatMessageKind;
  meta?: Record<string, unknown>;
}

export interface LLMProviderConfig {
  id: string;
  protocol: "openai-compatible" | "mock";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface WorldEvent {
  id: string;
  type: "moment.posted" | "moment.commented" | "session.message";
  actorId: string;
  text: string;
  momentId?: string;
  createdAt: number;
}

export interface MomentComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
}

export interface Moment {
  id: string;
  authorId: string;
  text: string;
  createdAt: number;
  likes: string[];
  comments: MomentComment[];
}

export interface PersonaPack {
  format: "pneuma-persona";
  formatVersion: 1;
  agent: AgentDefinition;
  memorySeed: { text: string; importance: number }[];
  firstMes?: string;
  exportedAt: number;
}