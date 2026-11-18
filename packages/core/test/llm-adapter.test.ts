import { test } from "node:test";
import assert from "node:assert/strict";
import type { LLMProviderConfig, ModelSpec } from "@pneuma/protocol";
import {
  AnthropicProvider,
  GeminiProvider,
  OpenAICompatProvider,
  assemblePrompt,
} from "@pneuma/core";

const spec: ModelSpec = {
  id: "test-model",
  name: "Test",
  context: 1000,
  input: 1000,
  output: 200,
  toolCall: true,
  reasoning: false,
  attachment: false,
  temperature: true,
  modalities: { input: ["text"], output: ["text"] },
  cost: null,
  status: "active",
};

function sseResponse(lines: string[]): Response {
  const body = lines.map((l) => `data: ${l}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function stubFetch(captured: Captured[], lines: string[]) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return sseResponse(lines);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const config: LLMProviderConfig = {
  id: "p",
  protocol: "openai-compatible",
  baseUrl: "https://example.test/v1/",
  apiKey: "k",
  model: "test-model",
  spec,
};

const messages = [
  { role: "system" as const, content: "s" },
  { role: "user" as const, content: "你好" },
];

test("OpenAI 兼容：max_tokens/temperature 对齐规格，工具声明传递", async () => {
  const captured: Captured[] = [];
  const restore = stubFetch(captured, [
    JSON.stringify({ choices: [{ delta: { content: "嗯。" } }] }),
    "[DONE]",
  ]);
  try {
    const provider = new OpenAICompatProvider(config);
    const deltas = [];
    for await (const d of provider.stream(messages, [
      { name: "remember", description: "d", parameters: {}, group: "memory" },
    ])) {
      deltas.push(d);
    }
    assert.equal(captured[0].url, "https://example.test/v1/chat/completions");
    assert.equal(captured[0].body.max_tokens, 200);
    assert.equal(captured[0].body.temperature, 0.8);
    assert.ok(Array.isArray(captured[0].body.tools));
    assert.ok(deltas.some((d) => d.type === "text"));
  } finally {
    restore();
  }
});

test("OpenAI 兼容：tool_call=false 时降级文本格式且不传 tools", async () => {
  const captured: Captured[] = [];
  const restore = stubFetch(captured, ["[DONE]"]);
  try {
    const provider = new OpenAICompatProvider({
      ...config,
      spec: { ...spec, toolCall: false },
    });
    for await (const _ of provider.stream(messages, [
      { name: "remember", description: "d", parameters: {}, group: "memory" },
    ])) {
      void _;
    }
    assert.equal(captured[0].body.tools, undefined);
    const msgs = captured[0].body.messages as { content: string }[];
    assert.ok(msgs.some((m) => m.content.includes("表达降级")));
  } finally {
    restore();
  }
});

test("OpenAI 兼容：流式 tool_calls 聚合为工具事件", async () => {
  const captured: Captured[] = [];
  const restore = stubFetch(captured, [
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, function: { name: "remember", arguments: '{"text":' } },
            ],
          },
        },
      ],
    }),
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"x"}' } }],
          },
          finish_reason: "tool_calls",
        },
      ],
    }),
  ]);
  try {
    const provider = new OpenAICompatProvider(config);
    const tools = [];
    for await (const d of provider.stream(messages, [])) {
      if (d.type === "tool") tools.push(d);
    }
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "remember");
    assert.deepEqual(tools[0].args, { text: "x" });
  } finally {
    restore();
  }
});

test("Anthropic：system 分离、max_tokens 对齐、tool_use 流解析", async () => {
  const captured: Captured[] = [];
  const restore = stubFetch(captured, [
    JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "嗨" } }),
    JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", name: "set_status" },
    }),
    JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: '{"text":"在"}' },
    }),
    JSON.stringify({ type: "content_block_stop", index: 0 }),
  ]);
  try {
    const provider = new AnthropicProvider({ ...config, protocol: "anthropic" });
    const deltas = [];
    for await (const d of provider.stream(messages, [])) deltas.push(d);
    assert.ok(captured[0].url.endsWith("/v1/messages"));
    assert.equal(captured[0].body.max_tokens, 200);
    assert.equal(captured[0].body.system, "s");
    assert.ok(deltas.some((d) => d.type === "text" && d.text === "嗨"));
    const tool = deltas.find((d) => d.type === "tool");
    assert.equal(tool?.name, "set_status");
  } finally {
    restore();
  }
});

test("Gemini：systemInstruction 分离、maxOutputTokens 对齐、functionCall 解析", async () => {
  const captured: Captured[] = [];
  const restore = stubFetch(captured, [
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: "好" }, { functionCall: { name: "remember", args: { text: "y" } } }] } },
      ],
    }),
  ]);
  try {
    const provider = new GeminiProvider({ ...config, protocol: "gemini" });
    const deltas = [];
    for await (const d of provider.stream(messages, [])) deltas.push(d);
    assert.ok(captured[0].url.includes(":streamGenerateContent?alt=sse"));
    const gc = captured[0].body.generationConfig as Record<string, unknown>;
    assert.equal(gc.maxOutputTokens, 200);
    assert.ok(captured[0].body.systemInstruction);
    assert.ok(deltas.some((d) => d.type === "tool" && d.name === "remember"));
  } finally {
    restore();
  }
});

test("上下文对齐：历史窗口按 context-output-system 裁剪", () => {
  const history = Array.from({ length: 50 }, (_, i) => ({
    role: "user" as const,
    content: `消息${i}：${"很长".repeat(30)}`,
  }));
  const prompt = assemblePrompt({
    agent: { id: "a", name: "n", persona: "p", tools: [] },
    memories: [],
    history,
    scene: { now: "t" },
    spec: { context: 1000, output: 200 },
  });
  assert.ok(prompt.totalTokens <= 1000);
  assert.ok(prompt.messages.length < history.length + 1);
});