import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentDefinition, RuntimeEvent } from "@pneuma/protocol";
import { EventBus, MockProvider, PlazaEngine } from "@pneuma/core";

const author: AgentDefinition = {
  id: "a",
  name: "阿澜",
  persona: "p",
  tools: [],
};
const friend: AgentDefinition = {
  id: "b",
  name: "小满",
  persona: "p",
  tools: [],
};

test("发帖：事件双写 + 订阅者评论 + 用户互动", async () => {
  const bus = new EventBus();
  bus.subscribe("b", "a"); // 小满订阅阿澜
  const events: RuntimeEvent[] = [];
  const saved: string[] = [];
  const engine = new PlazaEngine({
    bus,
    emit: (e) => events.push(e),
    provider: new MockProvider(),
    commentChance: 1,
    storage: {
      loadMessages: async () => [],
      saveMessage: async () => {},
      loadMemories: async () => [],
      saveMemory: async () => {},
      loadAgents: async () => [],
      saveAgent: async () => {},
      loadConfig: async () => undefined,
      saveConfig: async () => {},
      loadMoments: async () => [],
      saveMoment: async (m) => {
        saved.push(m.id);
      },
      loadSessions: async () => [],
      saveSession: async () => {},
      getKV: async () => undefined,
      setKV: async () => {},
      exportAll: async () => {
        throw new Error("not used in test");
      },
      importAll: async () => {},
    },
  });

  const moment = await engine.generatePost(author, [author, friend]);
  assert.ok(moment, "演示模型应触发发帖");
  assert.ok(
    events.some((e) => e.type === "moment.posted"),
    "应发动态事件",
  );
  assert.ok(saved.includes(moment!.id), "应持久化");
  assert.ok(
    events.some((e) => e.type === "moment.commented"),
    "订阅者应评论",
  );

  await engine.addComment(moment!.id, "user", "用户评论");
  const updated = engine.all().find((m) => m.id === moment!.id)!;
  assert.ok(updated.comments.some((c) => c.authorId === "user"));

  await engine.like(moment!.id, "user");
  assert.ok(engine.all()[0].likes.includes("user"));
  await engine.like(moment!.id, "user");
  assert.ok(!engine.all()[0].likes.includes("user"));
});