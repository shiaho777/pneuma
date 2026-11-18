import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  AgentDefinition,
  PromptLayer,
  RuntimeEvent,
  Session,
} from "@pneuma/protocol";
import {
  AgentRuntime,
  InnerVoiceStore,
  MemoryExtractor,
  MemoryStore,
  MockProvider,
} from "@pneuma/core";

const session: Session = {
  id: "s-int",
  participantIds: ["a1"],
  title: "集成",
  createdAt: Date.now(),
};

function makeAgent(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "a1",
    name: "阿澜",
    persona: "安静细腻的角色。",
    tools: ["remember", "set_status", "set_inner", "send_messages"],
    ...overrides,
  };
}

test("端到端：世界书关键词命中后注入 scene 层", async () => {
  const events: RuntimeEvent[] = [];
  const runtime = new AgentRuntime({
    memory: new MemoryStore(),
    provider: new MockProvider(),
    emit: (e) => events.push(e),
  });
  const agent = makeAgent({
    lore: [
      {
        id: "l1",
        keys: ["灯塔"],
        content: "灯塔建于1902年，是小镇的地标。",
        position: "scene",
      },
      { id: "l2", keys: ["雪山"], content: "不该出现的内容", position: "scene" },
    ],
  });

  await runtime.send(session, agent, "跟我讲讲灯塔吧");

  const assembled = events.filter((e) => e.type === "prompt.assembled");
  assert.ok(assembled.length > 0, "应触发装配事件");
  const scene = (assembled[assembled.length - 1].layers as PromptLayer[]).find(
    (l) => l.id === "scene",
  );
  assert.ok(scene, "应有 scene 层");
  assert.ok(scene!.content.includes("设定集命中"), "scene 层应标注设定集命中");
  assert.ok(scene!.content.includes("灯塔建于1902年"), "应注入命中原文");
  assert.ok(!scene!.content.includes("不该出现的内容"), "未命中条目不得注入");
});

test("端到端：世界书可注入 persona 层且不被裁剪", async () => {
  const events: RuntimeEvent[] = [];
  const runtime = new AgentRuntime({
    memory: new MemoryStore(),
    provider: new MockProvider(),
    emit: (e) => events.push(e),
  });
  const long = "设定".repeat(2000);
  const agent = makeAgent({
    lore: [{ id: "p", keys: ["灯塔"], content: long, position: "persona" }],
  });
  await runtime.send(session, agent, "灯塔");
  const last = events.filter((e) => e.type === "prompt.assembled").pop();
  const persona = (last!.layers as PromptLayer[]).find((l) => l.id === "persona");
  assert.ok(persona!.content.includes(long), "persona 层不裁剪，长设定应完整保留");
});

test("端到端：重复 remember 触发强化事件而非新增", async () => {
  const memory = new MemoryStore();
  const events: RuntimeEvent[] = [];
  const runtime = new AgentRuntime({
    memory,
    provider: new MockProvider(),
    emit: (e) => events.push(e),
  });
  const agent = makeAgent();
  await runtime.send(session, agent, "记住：我喜欢喝美式");
  await runtime.send(session, agent, "记住：我喜欢喝美式");
  const added = events.filter((e) => e.type === "memory.added");
  const reinforced = events.filter((e) => e.type === "memory.reinforced");
  assert.equal(added.length, 1, "同一事实只应新增一次");
  assert.ok(reinforced.length >= 1, "重复提及应强化");
  assert.equal(memory.all().filter((m) => m.agentId === "a1").length, 1);
});

test("端到端：心声跨轮注入下一轮场景层", async () => {
  const inner = new InnerVoiceStore();
  const events: RuntimeEvent[] = [];
  const runtime = new AgentRuntime({
    memory: new MemoryStore(),
    provider: new MockProvider(),
    inner,
    emit: (e) => events.push(e),
  });
  inner.set("a1", { emotion: "有点担心", pendingIntent: "想问她吃饭没" });
  await runtime.send(session, makeAgent(), "在吗");
  const last = events.filter((e) => e.type === "prompt.assembled").pop();
  const scene = (last!.layers as PromptLayer[]).find((l) => l.id === "scene");
  assert.ok(scene!.content.includes("有点担心"), "情绪应延续注入");
  assert.ok(scene!.content.includes("想问她吃饭没"), "未决意图应延续注入");
});

test("端到端：提取器按增量游标触发，低置信进待审", async () => {
  const memory = new MemoryStore();
  const events: RuntimeEvent[] = [];
  const extractor = new MemoryExtractor({
    memory,
    provider: {
      async *stream() {
        yield {
          type: "text" as const,
          text: '[{"text":"用户可能喜欢猫","importance":0.5,"confidence":0.4}]',
        };
      },
    },
  });
  const runtime = new AgentRuntime({
    memory,
    provider: new MockProvider(),
    extractor,
    emit: (e) => events.push(e),
  });
  const agent = makeAgent();
  // 每轮 user+assistant 至少 2 条，10 轮后超过 20 条阈值
  for (let i = 0; i < 10; i++) {
    await runtime.send(session, agent, `第${i}句闲话`);
  }
  const pending = events.filter((e) => e.type === "memory.pending");
  assert.ok(pending.length >= 1, "低置信候选应进入待审而非直接入库");
  assert.equal(pending[0].candidate.reason, "low-confidence");
  assert.equal(
    memory.all().filter((m) => m.source === "auto").length,
    0,
    "低置信不得自动入库",
  );
});