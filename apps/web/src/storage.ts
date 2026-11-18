import Dexie, { type Table } from "dexie";
import type {
  AgentDefinition,
  ChatMessage,
  LLMProviderConfig,
  MemoryItem,
  Moment,
  Session,
} from "@pneuma/protocol";
import type { PneumaStorage } from "@pneuma/core";

class PneumaDB extends Dexie {
  messages!: Table<ChatMessage, string>;
  memories!: Table<MemoryItem, string>;
  agents!: Table<AgentDefinition, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  moments!: Table<Moment, string>;
  sessions!: Table<Session, string>;

  constructor() {
    super("pneuma");
    this.version(1).stores({
      messages: "id, sessionId, createdAt",
      memories: "id, agentId",
      agents: "id",
      kv: "key",
    });
    this.version(2).stores({
      moments: "id, authorId, createdAt",
      sessions: "id",
    });
  }
}

export function createDexieStorage(): PneumaStorage {
  const db = new PneumaDB();
  return {
    async loadMessages(sessionId) {
      return db.messages
        .where("sessionId")
        .equals(sessionId)
        .sortBy("createdAt");
    },
    async saveMessage(message) {
      await db.messages.put(message);
    },
    async loadMemories() {
      return db.memories.toArray();
    },
    async saveMemory(item) {
      await db.memories.put(item);
    },
    async loadAgents() {
      return db.agents.toArray();
    },
    async saveAgent(agent) {
      await db.agents.put(agent);
    },
    async loadConfig() {
      const row = await db.kv.get("provider");
      return row?.value as LLMProviderConfig | undefined;
    },
    async saveConfig(config) {
      await db.kv.put({ key: "provider", value: config });
    },
    async loadMoments() {
      return db.moments.orderBy("createdAt").reverse().toArray();
    },
    async saveMoment(moment) {
      await db.moments.put(moment);
    },
    async loadSessions() {
      return db.sessions.toArray();
    },
    async saveSession(session) {
      await db.sessions.put(session);
    },
    async getKV(key) {
      return (await db.kv.get(key))?.value;
    },
    async setKV(key, value) {
      await db.kv.put({ key, value });
    },
    async exportAll() {
      const [messages, memories, agents, moments, sessions, config] =
        await Promise.all([
          db.messages.toArray(),
          db.memories.toArray(),
          db.agents.toArray(),
          db.moments.toArray(),
          db.sessions.toArray(),
          db.kv.get("provider"),
        ]);
      return {
        format: "pneuma-backup",
        formatVersion: 1,
        exportedAt: Date.now(),
        messages,
        memories,
        agents,
        moments,
        sessions,
        config: config?.value as LLMProviderConfig | undefined,
      };
    },
    async importAll(backup) {
      if (backup.format !== "pneuma-backup" || backup.formatVersion !== 1) {
        throw new Error("不是有效的 Pneuma 备份文件");
      }
      await db.transaction(
        "rw",
        [db.messages, db.memories, db.agents, db.moments, db.sessions, db.kv],
        async () => {
          await Promise.all([
            db.messages.clear(),
            db.memories.clear(),
            db.agents.clear(),
            db.moments.clear(),
            db.sessions.clear(),
          ]);
          await db.messages.bulkPut(backup.messages);
          await db.memories.bulkPut(backup.memories);
          await db.agents.bulkPut(backup.agents);
          await db.moments.bulkPut(backup.moments);
          await db.sessions.bulkPut(backup.sessions);
          if (backup.config) {
            await db.kv.put({ key: "provider", value: backup.config });
          }
        },
      );
    },
  };
}