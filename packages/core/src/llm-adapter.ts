import type {
  LLMMessage,
  LLMProviderConfig,
  LLMRequestOptions,
  ToolSpec,
} from "@pneuma/protocol";

export type ProviderDelta =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> };

export interface LLMProvider {
  stream(
    messages: LLMMessage[],
    tools: ToolSpec[],
    signal?: AbortSignal,
    options?: LLMRequestOptions,
  ): AsyncIterable<ProviderDelta>;
}

const TEXT_TOOL_FALLBACK =
  "\n\n## 表达降级\n当前模型不支持工具调用。请用纯文本表达：每条短消息单独一行；状态行以「状态：」开头单独一行。";

function requestOptions(
  config: LLMProviderConfig,
  options?: LLMRequestOptions,
): LLMRequestOptions {
  const spec = config.spec;
  return {
    maxOutputTokens:
      options?.maxOutputTokens ?? (spec?.output ? spec.output : undefined),
    temperature:
      options?.temperature ?? (spec?.temperature ? 0.8 : undefined),
  };
}

function toolsFor(
  config: LLMProviderConfig,
  tools: ToolSpec[],
): { tools: ToolSpec[]; fallback: boolean } {
  if (!tools.length) return { tools: [], fallback: false };
  if (config.spec && !config.spec.toolCall) {
    return { tools: [], fallback: true };
  }
  return { tools, fallback: false };
}

async function* sseLines(
  res: Response,
): AsyncIterable<string> {
  if (!res.ok || !res.body) {
    throw new Error(`provider http ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
    }
  }
}

export class OpenAICompatProvider implements LLMProvider {
  constructor(private config: LLMProviderConfig) {}

  async *stream(
    messages: LLMMessage[],
    tools: ToolSpec[],
    signal?: AbortSignal,
    options?: LLMRequestOptions,
  ): AsyncIterable<ProviderDelta> {
    const base = (this.config.baseUrl ?? "").replace(/\/+$/, "");
    const opts = requestOptions(this.config, options);
    const { tools: usable, fallback } = toolsFor(this.config, tools);
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: fallback
        ? [...messages, { role: "system", content: TEXT_TOOL_FALLBACK }]
        : messages,
      stream: true,
    };
    if (opts.maxOutputTokens) body.max_tokens = opts.maxOutputTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (usable.length) {
      body.tools = usable.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey ?? ""}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const toolBuffers = new Map<number, { name: string; args: string }>();
    for await (const payload of sseLines(res)) {
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload) as {
          choices?: {
            delta?: {
              content?: string;
              tool_calls?: {
                index: number;
                function?: { name?: string; arguments?: string };
              }[];
            };
            finish_reason?: string;
          }[];
        };
        const choice = json.choices?.[0];
        const text = choice?.delta?.content;
        if (text) yield { type: "text", text };
        for (const tc of choice?.delta?.tool_calls ?? []) {
          const buf = toolBuffers.get(tc.index) ?? { name: "", args: "" };
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) buf.args += tc.function.arguments;
          toolBuffers.set(tc.index, buf);
        }
        if (choice?.finish_reason === "tool_calls") {
          for (const buf of toolBuffers.values()) {
            if (!buf.name) continue;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(buf.args || "{}");
            } catch {
              args = {};
            }
            yield { type: "tool", name: buf.name, args };
          }
          toolBuffers.clear();
        }
      } catch {
        // 忽略不完整的 SSE 行
      }
    }
    for (const buf of toolBuffers.values()) {
      if (!buf.name) continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(buf.args || "{}");
      } catch {
        args = {};
      }
      yield { type: "tool", name: buf.name, args };
    }
  }
}

export class AnthropicProvider implements LLMProvider {
  constructor(private config: LLMProviderConfig) {}

  async *stream(
    messages: LLMMessage[],
    tools: ToolSpec[],
    signal?: AbortSignal,
    options?: LLMRequestOptions,
  ): AsyncIterable<ProviderDelta> {
    const base = (
      this.config.baseUrl || "https://api.anthropic.com"
    ).replace(/\/+$/, "");
    const opts = requestOptions(this.config, options);
    const { tools: usable, fallback } = toolsFor(this.config, tools);
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: opts.maxOutputTokens ?? 8192,
      system: fallback ? system + TEXT_TOOL_FALLBACK : system,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (usable.length) {
      body.tools = usable.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal,
    });
    const blocks = new Map<number, { name: string; args: string }>();
    for await (const payload of sseLines(res)) {
      try {
        const ev = JSON.parse(payload) as {
          type?: string;
          index?: number;
          content_block?: { type?: string; name?: string };
          delta?: { type?: string; text?: string; partial_json?: string };
        };
        if (
          ev.type === "content_block_start" &&
          ev.content_block?.type === "tool_use"
        ) {
          blocks.set(ev.index ?? 0, {
            name: ev.content_block.name ?? "",
            args: "",
          });
        } else if (ev.type === "content_block_delta") {
          if (ev.delta?.type === "text_delta" && ev.delta.text) {
            yield { type: "text", text: ev.delta.text };
          } else if (ev.delta?.type === "input_json_delta") {
            const buf = blocks.get(ev.index ?? 0);
            if (buf) buf.args += ev.delta.partial_json ?? "";
          }
        } else if (ev.type === "content_block_stop") {
          const buf = blocks.get(ev.index ?? 0);
          if (buf?.name) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(buf.args || "{}");
            } catch {
              args = {};
            }
            yield { type: "tool", name: buf.name, args };
            blocks.delete(ev.index ?? 0);
          }
        }
      } catch {
        // 忽略不完整的 SSE 行
      }
    }
  }
}

export class GeminiProvider implements LLMProvider {
  constructor(private config: LLMProviderConfig) {}

  async *stream(
    messages: LLMMessage[],
    tools: ToolSpec[],
    signal?: AbortSignal,
    options?: LLMRequestOptions,
  ): AsyncIterable<ProviderDelta> {
    const base = (
      this.config.baseUrl || "https://generativelanguage.googleapis.com"
    ).replace(/\/+$/, "");
    const opts = requestOptions(this.config, options);
    const { tools: usable, fallback } = toolsFor(this.config, tools);
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const generationConfig: Record<string, unknown> = {};
    if (opts.maxOutputTokens)
      generationConfig.maxOutputTokens = opts.maxOutputTokens;
    if (opts.temperature !== undefined)
      generationConfig.temperature = opts.temperature;
    const body: Record<string, unknown> = {
      contents: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      generationConfig,
    };
    if (system) {
      body.systemInstruction = {
        parts: [{ text: fallback ? system + TEXT_TOOL_FALLBACK : system }],
      };
    }
    if (usable.length) {
      body.tools = [
        {
          functionDeclarations: usable.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    const url = `${base}/v1beta/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey ?? ""}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    for await (const payload of sseLines(res)) {
      try {
        const json = JSON.parse(payload) as {
          candidates?: {
            content?: {
              parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[];
            };
          }[];
        };
        for (const part of json.candidates?.[0]?.content?.parts ?? []) {
          if (part.text) yield { type: "text", text: part.text };
          if (part.functionCall?.name) {
            yield {
              type: "tool",
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            };
          }
        }
      } catch {
        // 忽略不完整的 SSE 行
      }
    }
  }
}

export class MockProvider implements LLMProvider {
  async *stream(
    messages: LLMMessage[],
    _tools: ToolSpec[],
    _signal?: AbortSignal,
    _options?: LLMRequestOptions,
  ): AsyncIterable<ProviderDelta> {
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    const q = lastUser?.content ?? "";
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    if (system.includes("## plaza")) {
      if (q.includes("发一条朋友圈")) {
        yield {
          type: "tool",
          name: "post_moment",
          args: { text: "今天的风很舒服，想出去走走。" },
        };
        return;
      }
      yield { type: "text", text: "这张照片的氛围真好。\n" };
      return;
    }
    yield { type: "tool", name: "set_status", args: { text: "在听你说话" } };
    if (q.includes("记住")) {
      yield {
        type: "tool",
        name: "remember",
        args: { text: q.replace(/^.*记住[：:]?/, ""), importance: 0.8 },
      };
    }
    const sentences = [
      `嗯，我在听。`,
      `你说的「${q.slice(0, 24)}」，我记下了。`,
      `今天过得怎么样？`,
    ];
    for (const s of sentences) {
      yield { type: "text", text: s + "\n" };
    }
  }
}

export function createProvider(config?: LLMProviderConfig): LLMProvider {
  if (config && config.protocol === "openai-compatible") {
    return new OpenAICompatProvider(config);
  }
  if (config && config.protocol === "anthropic") {
    return new AnthropicProvider(config);
  }
  if (config && config.protocol === "gemini") {
    return new GeminiProvider(config);
  }
  return new MockProvider();
}