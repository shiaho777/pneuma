import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentDefinition } from "@pneuma/protocol";
import {
  PRESETS,
  agentFromPack,
  buildPersonaPack,
  instantiatePreset,
  parsePersonaPack,
} from "@pneuma/core";

const agent: AgentDefinition = {
  id: "a1",
  name: "测试",
  persona: "p",
  tools: ["remember"],
};

test("人格包往返：导出→解析→新 ID 不冲突", () => {
  const pack = buildPersonaPack(agent, [{ text: "种子", importance: 0.6 }], "开场");
  const parsed = parsePersonaPack(JSON.parse(JSON.stringify(pack)));
  assert.equal(parsed.agent.name, "测试");
  assert.equal(parsed.firstMes, "开场");
  const imported = agentFromPack(parsed);
  assert.notEqual(imported.id, agent.id);
  assert.equal(imported.persona, "p");
});

test("坏包报错：格式/版本/agent 校验", () => {
  assert.throws(() => parsePersonaPack({ hello: 1 }));
  assert.throws(() =>
    parsePersonaPack({ format: "pneuma-persona", formatVersion: 2, agent }),
  );
  assert.throws(() =>
    parsePersonaPack({ format: "pneuma-persona", formatVersion: 1 }),
  );
});

test("四预设实例化：角色/工具/记忆种子/开场完整", () => {
  assert.equal(PRESETS.length, 4);
  for (const preset of PRESETS) {
    const inst = instantiatePreset(preset);
    assert.equal(inst.agents.length, preset.agents.length);
    assert.ok(inst.agents.every((a) => a.tools.length > 0));
    assert.ok(inst.memorySeed.length > 0);
    assert.ok(inst.memorySeed.every((m) => inst.agents.some((a) => a.id === m.agentId)));
    assert.equal(inst.firstMes.length, inst.agents.length);
    assert.equal(inst.group, preset.group);
  }
  const ensemble = PRESETS.find((p) => p.id === "ensemble")!;
  assert.equal(instantiatePreset(ensemble).agents.length, 3);
});