import type {
  AgentDefinition,
  ChatMessage,
  LLMProviderConfig,
  MemoryItem,
  Moment,
  Session,
} from "@pneuma/protocol";

export interface PneumaStorage {
  loadMessages(sessionId: string): Promise<ChatMessage[]>;
  saveMessage(message: ChatMessage): Promise<void>;
  loadMemories(): Promise<MemoryItem[]>;
  saveMemory(item: MemoryItem): Promise<void>;
  loadAgents(): Promise<AgentDefinition[]>;
  saveAgent(agent: AgentDefinition): Promise<void>;
  loadConfig(): Promise<LLMProviderConfig | undefined>;
  saveConfig(config: LLMProviderConfig): Promise<void>;
  loadMoments(): Promise<Moment[]>;
  saveMoment(moment: Moment): Promise<void>;
  loadSessions(): Promise<Session[]>;
  saveSession(session: Session): Promise<void>;
  getKV(key: string): Promise<unknown>;
  setKV(key: string, value: unknown): Promise<void>;
  exportAll(): Promise<PneumaBackup>;
  importAll(backup: PneumaBackup): Promise<void>;
}

export interface PneumaBackup {
  format: "pneuma-backup";
  formatVersion: 1;
  exportedAt: number;
  messages: ChatMessage[];
  memories: MemoryItem[];
  agents: AgentDefinition[];
  moments: Moment[];
  sessions: Session[];
  config?: LLMProviderConfig;
}