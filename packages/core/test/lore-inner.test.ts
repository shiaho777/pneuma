import { test } from "node:test";
import assert from "node:assert/strict";
import type { LoreEntry } from "@pneuma/protocol";
import { InnerVoiceStore, loreFor, scanLore } from "@pneuma/core";

const history = [{ role: "user" as const, content: "我们聊聊海边小镇的灯塔吧" }];

test("关键词命中与未命中", () => {
  const entries: LoreEntry[] = [
    { id: "l1", keys: ["灯塔"], content: "灯塔建于1902年。" },
    { id: "l2", keys: ["雪山"], content: "雪山在北方。" },
  ];
  const hits = scanLore(entries, history);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].entry.id, "l1");
});

test("辅关键词 and/or 语义", () => {
  const base: LoreEntry = {
    id: "l",
    keys: ["灯塔"],
    secondaryKeys: ["海边小镇", "雪山"],
    content: "x",
  };
  assert.equal(
    scanLore([{ ...base, secondaryMode: "or" }], history).length,
    1,
  );
  assert.equal(
    scanLore([{ ...base, secondaryMode: "and" }], history).length,
    0,
  );
});

test("常驻条目无视关键词；停用条目不注入", () => {
  const entries: LoreEntry[] = [
    { id: "c", keys: [], constant: true, content: "世界基本规则。" },
    { id: "off", keys: ["灯塔"], content: "停用内容", enabled: false },
  ];
  const hits = scanLore(entries, history);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].entry.id, "c");
});

test("概率确定性：同 seed 同结果，0% 必不中，100% 必中", () => {
  const entry: LoreEntry = {
    id: "p",
    keys: ["灯塔"],
    content: "概率内容",
    probability: 50,
  };
  const a = scanLore([entry], history, { sessionId: "s1", turn: 3 });
  const b = scanLore([entry], history, { sessionId: "s1", turn: 3 });
  assert.equal(a.length, b.length);
  assert.equal(scanLore([{ ...entry, probability: 0 }], history).length, 0);
  assert.equal(scanLore([{ ...entry, probability: 100 }], history).length, 1);
});

test("字符预算与优先级排序", () => {
  const entries: LoreEntry[] = [
    { id: "low", keys: ["灯塔"], content: "A".repeat(200), priority: 1 },
    { id: "high", keys: ["灯塔"], content: "B".repeat(200), priority: 9 },
  ];
  const hits = scanLore(entries, history, { charBudget: 250 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].entry.id, "high");
});

test("注入位分流", () => {
  const entries: LoreEntry[] = [
    { id: "a", keys: ["灯塔"], content: "人格侧设定", position: "persona" },
    { id: "b", keys: ["灯塔"], content: "场景侧设定", position: "scene" },
  ];
  const hits = scanLore(entries, history);
  assert.equal(loreFor(hits, "persona"), "人格侧设定");
  assert.equal(loreFor(hits, "scene"), "场景侧设定");
  assert.equal(loreFor(hits, "memory"), "");
});

test("心声跨轮延续与意图清除", () => {
  const inner = new InnerVoiceStore();
  inner.set("a1", { emotion: "有点担心", pendingIntent: "想问她有没有吃饭" });
  const rendered = inner.render("a1");
  assert.ok(rendered.includes("有点担心"));
  assert.ok(rendered.includes("想问她有没有吃饭"));
  inner.clearIntent("a1");
  assert.ok(!inner.render("a1").includes("想问她"));
  assert.ok(inner.render("a1").includes("有点担心"));
  assert.equal(inner.render("unknown"), "");
});