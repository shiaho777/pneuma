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

export type MemoryState = "active" | "faded" | "archived";

export interface MemoryItem {
  id: string;
  agentId: string;
  kind: MemoryKind;
  text: string;
  importance: number;
  createdAt: number;
  pinned?: boolean;
  state?: MemoryState;
  activations?: number;
  lastActivatedAt?: number;
  emotion?: number;
  source?: "tool" | "auto" | "seed" | "user";
  fadedAt?: number;
}

export interface MemoryCandidate {
  id: string;
  agentId: string;
  text: string;
  importance: number;
  confidence: number;
  reason: "low-confidence" | "conflict";
  conflictWith?: string;
  createdAt: number;
}

export interface LoreEntry {
  id: string;
  agentId?: string;
  keys: string[];
  secondaryKeys?: string[];
  secondaryMode?: "and" | "or";
  content: string;
  constant?: boolean;
  probability?: number;
  priority?: number;
  position?: "persona" | "memory" | "scene";
  enabled?: boolean;
}

export interface InnerState {
  emotion?: string;
  concern?: string;
  pendingIntent?: string;
  updatedAt: number;
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
  lore?: LoreEntry[];
  innerVoice?: boolean;
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

export type LLMProtocol = "openai-compatible" | "anthropic" | "gemini";

export interface ModelSpec {
  id: string;
  name: string;
  context: number;
  input: number;
  output: number;
  toolCall: boolean;
  reasoning: boolean;
  attachment: boolean;
  temperature: boolean;
  modalities: { input: string[]; output: string[] };
  cost: { input?: number; output?: number; cache_read?: number } | null;
  status: string;
  family?: string;
  description?: string;
  releaseDate?: string;
  lastUpdated?: string;
  structuredOutput?: boolean;
  openWeights?: boolean;
}

export interface CatalogProvider {
  id: string;
  name: string;
  protocol: LLMProtocol;
  baseUrl: string;
  env: string[];
  doc: string;
  models: ModelSpec[];
}

export interface ModelCatalog {
  source: string;
  generatedAt: string;
  providers: CatalogProvider[];
}

export interface ProviderModel {
  id: string;
  enabled: boolean;
  spec?: ModelSpec;
}

export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  protocol: LLMProtocol;
  apiKey: string;
  models: ProviderModel[];
  catalogProviderId?: string;
}

export interface AIConfig {
  providers: ProviderConfig[];
  active: { providerId: string; modelId: string } | null;
}

export interface LLMProviderConfig {
  id: string;
  protocol: LLMProtocol | "mock";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  spec?: ModelSpec;
}

export interface LLMRequestOptions {
  maxOutputTokens?: number;
  temperature?: number;
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
  lore?: LoreEntry[];
  firstMes?: string;
  exportedAt: number;
}