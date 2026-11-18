import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCardFromPng,
  parseCharacterCard,
} from "@pneuma/core";

const CARD = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "测试卡",
    description: "一个温柔的角色。",
    personality: "细腻",
    first_mes: "你好呀。",
    alternate_greetings: ["嗨。"],
    mes_example: "<START>\n{{user}}: 早\n{{char}}: 早呀",
    character_book: {
      entries: [{ content: "世界设定：海边小镇。" }],
    },
  },
};

test("V2 JSON 映射：人格/风格/开场/世界书", () => {
  const card = parseCharacterCard(CARD);
  assert.equal(card.agent.name, "测试卡");
  assert.ok(card.agent.persona.includes("温柔"));
  assert.ok(card.agent.persona.includes("细腻"));
  assert.ok(card.agent.style?.includes("早呀"));
  assert.equal(card.firstMes, "你好呀。");
  assert.deepEqual(card.alternateGreetings, ["嗨。"]);
  assert.deepEqual(card.loreEntries, ["世界设定：海边小镇。"]);
  assert.ok(card.agent.tools.includes("remember"));
});

function crc32(bytes: Uint8Array): number {
  let c: number;
  let crc = 0xffffffff;
  for (const b of bytes) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function buildPngWithCard(json: unknown): ArrayBuffer {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const b64 = Buffer.from(JSON.stringify(json), "utf8").toString("base64");
  const keyword = new TextEncoder().encode("chara");
  const payload = new TextEncoder().encode(b64);
  const textData = new Uint8Array(keyword.length + 1 + payload.length);
  textData.set(keyword, 0);
  textData[keyword.length] = 0;
  textData.set(payload, keyword.length + 1);
  const ihdr = new Uint8Array(13);
  const parts = [sig, chunk("IHDR", ihdr), chunk("tEXt", textData), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png.buffer;
}

test("PNG 内嵌 chara 块提取", () => {
  const png = buildPngWithCard(CARD);
  const json = extractCardFromPng(png);
  assert.ok(json, "应提取到卡数据");
  const card = parseCharacterCard(json);
  assert.equal(card.agent.name, "测试卡");
});

test("非 PNG 返回 null，不抛异常", () => {
  const fake = new TextEncoder().encode("not a png").buffer;
  assert.equal(extractCardFromPng(fake), null);
});