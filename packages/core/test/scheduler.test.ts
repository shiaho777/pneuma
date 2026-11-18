import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentDefinition } from "@pneuma/protocol";
import { EventBus, scheduleSpeakers } from "@pneuma/core";

const a: AgentDefinition = {
  id: "a",
  name: "阿澜",
  persona: "p",
  tools: [],
};
const b: AgentDefinition = {
  id: "b",
  name: "小满",
  persona: "p",
  tools: [],
};
const c: AgentDefinition = {
  id: "c",
  name: "老周",
  persona: "p",
  tools: [],
};

test("被提及者必发言，其余沉默且有理由", () => {
  const decisions = scheduleSpeakers([a, b, c], "小满你今天怎么样？");
  const xiaoman = decisions.find((d) => d.agentId === "b")!;
  assert.equal(xiaoman.speak, true);
  assert.ok(xiaoman.reason.includes("提及"));
  for (const d of decisions.filter((d) => d.agentId !== "b")) {
    assert.equal(d.speak, false);
    assert.ok(d.reason.length > 0);
  }
});

test("无人被提及：轮值发言且不超过上限", () => {
  const decisions = scheduleSpeakers([a, b, c], "今天天气不错", {}, {
    maxSpeakers: 2,
    lastSpeakerId: "a",
  });
  const speakers = decisions.filter((d) => d.speak);
  assert.equal(speakers.length, 1);
  assert.notEqual(speakers[0].agentId, "a");
});

test("状态相关者发言", () => {
  const decisions = scheduleSpeakers([a, b], "美式好喝吗", {
    a: "在喝美式",
  });
  assert.equal(decisions.find((d) => d.agentId === "a")!.speak, true);
});

test("事件总线订阅制：只投递订阅来源，排除自己", () => {
  const bus = new EventBus();
  bus.subscribe("a", "b");
  bus.publish({ type: "moment.posted", actorId: "b", text: "b 的动态" });
  bus.publish({ type: "moment.posted", actorId: "c", text: "c 的动态" });
  bus.publish({ type: "moment.posted", actorId: "a", text: "a 自己的" });
  const forA = bus.relevantFor("a");
  assert.equal(forA.length, 1);
  assert.equal(forA[0].actorId, "b");
  assert.equal(bus.relevantFor("c").length, 0);
});