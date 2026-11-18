import type {
  LLMMessage,
  LLMProviderConfig,
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
  ): AsyncIterable<ProviderDelta>;
}

export class OpenAICompatProvider implements LLMProvider {
  constructor(private config: LLMProviderConfig) {}

  async *stream(
    messages: LLMMessage[],
    _tools: ToolSpec[],
    signal?: AbortSignal,
  ): AsyncIterable<ProviderDelta> {
    const base = (this.config.baseUrl ?? "").replace(/\/+$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
      }),
      signal,
    });
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
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield { type: "text", text };
        } catch {
          // 忽略不完整的 SSE 行
        }
      }
    }
  }
}

export class MockProvider implements LLMProvider {
  async *stream(
    messages: LLMMessage[],
    _tools: ToolSpec[],
    _signal?: AbortSignal,
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
  return new MockProvider();
}