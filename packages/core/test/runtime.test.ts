import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentDefinition, RuntimeEvent, Session } from "@pneuma/protocol";
import {
  AgentRuntime,
  MemoryStore,
  MockProvider,
  assemblePrompt,
} from "@pneuma/core";

const agent: AgentDefinition = {
  id: "a1",
  name: "测试角色",
  persona: "温柔、话碎、像活人。",
  tools: ["set_status", "remember", "send_messages", "send_sticker"],
};

const session: Session = {
  id: "s1",
  participantIds: ["a1"],
  title: "测试会话",
  createdAt: Date.now(),
};

test("mock 闭环：拆句多气泡 + 状态行 + 记忆注入 + 历史回放", async () => {
  const memory = new MemoryStore();
  const events: RuntimeEvent[] = [];
  const runtime = new AgentRuntime({
    provider: new MockProvider(),
    memory,
    emit: (e) => events.push(e),
  });

  await runtime.send(session, agent, "记住：我喜欢喝美式");
  await runtime.send(session, agent, "今天好累");

  const completed = events.filter((e) => e.type === "message.completed");
  assert.ok(completed.length >= 6, "用户消息+拆句应产生多条气泡");
  assert.ok(
    events.some((e) => e.type === "status.updated"),
    "应更新状态行",
  );
  const added = events.find((e) => e.type === "memory.added");
  assert.ok(added && added.agentId === "a1", "记忆应归属角色");

  const promptEvents = events.filter((e) => e.type === "prompt.assembled");
  const last = promptEvents[promptEvents.length - 1];
  assert.ok(last, "应有装配事件");
  const memoryLayer = last.layers.find((l) => l.id === "memory");
  assert.ok(memoryLayer?.content.includes("美式"), "记忆应注入提示词");

  runtime.restoreHistory(session.id, [
    {
      id: "h1",
      sessionId: session.id,
      role: "user",
      content: "回放的历史消息",
      createdAt: 1,
    },
  ]);
  events.length = 0;
  await runtime.send(session, agent, "继续");
  const replayed = events.find((e) => e.type === "prompt.assembled");
  assert.ok(replayed, "回放后仍应装配");
});

test("记忆按角色隔离", () => {
  const memory = new MemoryStore();
  memory.add("semantic", "角色一的秘密", 0.9, false, "a1");
  memory.add("semantic", "角色二的秘密", 0.9, false, "a2");
  const forA1 = memory.retrieve("", 10).filter((m) => m.agentId === "a1");
  assert.equal(forA1.length, 1);
  assert.ok(forA1[0].text.includes("角色一"));
});

test("预算裁剪：记忆层超预算按字符裁剪，人格层不裁", () => {
  const memory = new MemoryStore();
  for (let i = 0; i < 50; i++) memory.add("semantic", "很长的事实".repeat(40));
  const prompt = assemblePrompt({
    agent: { ...agent, persona: "人格".repeat(2000) },
    memories: memory.retrieve("", 50),
    history: [],
    scene: { now: "test" },
  });
  const mem = prompt.layers.find((l) => l.id === "memory");
  const persona = prompt.layers.find((l) => l.id === "persona");
  assert.ok(mem && mem.content.length <= mem.budget * 2);
  assert.ok(persona && persona.content.length > persona.budget * 2);
});