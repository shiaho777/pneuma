import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore, similarity } from "@pneuma/core";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test("相似度：同义高、无关低", () => {
  assert.ok(similarity("我喜欢喝美式咖啡", "我喜欢喝美式咖啡") > 0.9);
  assert.ok(similarity("我喜欢喝美式", "今天天气真好") < 0.2);
});

test("重复提及走强化而非新增", () => {
  const m = new MemoryStore();
  const a = m.addOrReinforce("semantic", "用户喜欢喝美式咖啡", 0.6, "a1");
  const b = m.addOrReinforce("semantic", "用户喜欢喝美式咖啡", 0.6, "a1");
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(m.all().length, 1);
  assert.ok((b.item.activations ?? 0) >= 1);
});

test("强度随时间衰减，钉住恒为 1", () => {
  const m = new MemoryStore();
  const now = Date.now();
  const item = m.add("semantic", "很久以前的事", 0.3, false, "a1", {
    emotion: 0.2,
  });
  item.createdAt = now - 200 * HOUR;
  const pinned = m.add("semantic", "钉住的记忆", 0.3, true, "a1");
  pinned.createdAt = now - 200 * HOUR;
  assert.ok(m.strength(item, now) < 0.5);
  assert.equal(m.strength(pinned, now), 1);
});

test("低强度转 faded，长期 faded 转 archived", () => {
  const m = new MemoryStore();
  const now = Date.now();
  const item = m.add("semantic", "淡忘的琐事", 0.1, false, "a1", {
    emotion: 0.1,
  });
  item.createdAt = now - 300 * HOUR;
  m.tick(now);
  assert.equal(item.state, "faded");
  item.fadedAt = now - 8 * DAY;
  m.tick(now);
  assert.equal(item.state, "archived");
});

test("归档条目：无相关查询不召回，高相关可召回", () => {
  const m = new MemoryStore();
  const now = Date.now();
  const item = m.add("semantic", "用户养了一只叫团子的橘猫", 0.1, false, "a1", {
    emotion: 0.1,
  });
  item.createdAt = now - 300 * HOUR;
  m.tick(now);
  item.fadedAt = now - 8 * DAY;
  m.tick(now);
  assert.equal(item.state, "archived");
  const irrelevant = m.retrieve("今天股市怎么样", 10, now, "a1");
  assert.ok(!irrelevant.some((x) => x.id === item.id));
  const relevant = m.retrieve("用户养了一只叫团子的橘猫", 10, now, "a1");
  assert.ok(relevant.some((x) => x.id === item.id));
});

test("冲突识别：中等相似判为可能冲突", () => {
  const m = new MemoryStore();
  m.add("semantic", "用户住在山东枣庄", 0.7, false, "a1");
  const conflict = m.findConflict("用户住在山东济南", "a1");
  assert.ok(conflict, "应识别为可能冲突");
  const dup = m.findSimilar("用户住在山东枣庄", "a1");
  assert.ok(dup, "完全相同应判重而非冲突");
});

test("检索按角色隔离且命中会强化", () => {
  const m = new MemoryStore();
  m.add("semantic", "甲的秘密", 0.8, false, "a1");
  m.add("semantic", "乙的秘密", 0.8, false, "a2");
  const got = m.retrieve("秘密", 10, Date.now(), "a1");
  assert.equal(got.length, 1);
  assert.ok(got[0].text.includes("甲"));
  assert.ok((got[0].activations ?? 0) >= 1);
});