import type { LLMProtocol } from "@pneuma/protocol";

export interface RemoteModel {
  id: string;
  name?: string;
  context?: number;
  output?: number;
}

export async function fetchRemoteModels(
  baseUrl: string,
  apiKey: string,
  protocol: LLMProtocol,
): Promise<RemoteModel[]> {
  const base = baseUrl.replace(/\/+$/, "");
  if (!base) throw new Error("Base URL 未填写");
  let url: string;
  let headers: Record<string, string> = { "Content-Type": "application/json" };
  if (protocol === "anthropic") {
    url = `${base}/v1/models`;
    headers = {
      ...headers,
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  } else if (protocol === "gemini") {
    url = `${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  } else {
    url = `${base}/models`;
    headers = { ...headers, Authorization: `Bearer ${apiKey}` };
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`模型列表请求失败：HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;

  if (protocol === "gemini") {
    const models = (json.models ?? []) as {
      name?: string;
      displayName?: string;
      inputTokenLimit?: number;
      outputTokenLimit?: number;
    }[];
    return models.map((m) => ({
      id: (m.name ?? "").replace(/^models\//, ""),
      name: m.displayName,
      context: m.inputTokenLimit,
      output: m.outputTokenLimit,
    }));
  }
  const data = (json.data ?? []) as {
    id?: string;
    display_name?: string;
    max_tokens?: number;
    context_window?: number;
  }[];
  return data
    .filter((m) => m.id)
    .map((m) => ({
      id: m.id as string,
      name: m.display_name,
      context: m.context_window,
      output: m.max_tokens,
    }));
}