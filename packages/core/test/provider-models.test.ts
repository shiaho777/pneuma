import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRemoteModels } from "@pneuma/core";

function stub(body: unknown, capture: { url?: string; headers?: Record<string, string> }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capture.url = String(url);
    capture.headers = (init?.headers ?? {}) as Record<string, string>;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("OpenAI 兼容：/models + Bearer 头 + data 解析", async () => {
  const cap: { url?: string; headers?: Record<string, string> } = {};
  const restore = stub({ data: [{ id: "m1" }, { id: "m2", context_window: 1000 }] }, cap);
  try {
    const models = await fetchRemoteModels("https://x.test/v1/", "k", "openai-compatible");
    assert.equal(cap.url, "https://x.test/v1/models");
    assert.equal(cap.headers?.Authorization, "Bearer k");
    assert.equal(models.length, 2);
    assert.equal(models[1].context, 1000);
  } finally {
    restore();
  }
});

test("Anthropic：/v1/models + x-api-key 头", async () => {
  const cap: { url?: string; headers?: Record<string, string> } = {};
  const restore = stub({ data: [{ id: "claude-x", display_name: "Claude X" }] }, cap);
  try {
    const models = await fetchRemoteModels("https://api.anthropic.com", "k", "anthropic");
    assert.equal(cap.url, "https://api.anthropic.com/v1/models");
    assert.equal(cap.headers?.["x-api-key"], "k");
    assert.equal(models[0].name, "Claude X");
  } finally {
    restore();
  }
});

test("Gemini：v1beta/models + key 参数 + token 限制解析", async () => {
  const cap: { url?: string } = {};
  const restore = stub(
    { models: [{ name: "models/gemini-x", displayName: "Gemini X", inputTokenLimit: 1000000, outputTokenLimit: 8192 }] },
    cap,
  );
  try {
    const models = await fetchRemoteModels("https://g.test", "k", "gemini");
    assert.ok(cap.url?.includes("/v1beta/models?key=k"));
    assert.equal(models[0].id, "gemini-x");
    assert.equal(models[0].context, 1000000);
    assert.equal(models[0].output, 8192);
  } finally {
    restore();
  }
});