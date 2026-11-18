import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2] ?? "https://models.dev/api.json";

const raw = source.startsWith("http")
  ? await (await fetch(source)).json()
  : JSON.parse(readFileSync(source, "utf8"));

function protocolOf(npm) {
  if (!npm) return "openai-compatible";
  if (npm.includes("anthropic")) return "anthropic";
  if (npm.includes("google")) return "gemini";
  return "openai-compatible";
}

const providers = [];
for (const p of Object.values(raw)) {
  const models = [];
  for (const m of Object.values(p.models ?? {})) {
    if (m.type && m.type !== "chat") continue;
    const limit = m.limit ?? {};
    if (!limit.context) continue;
    models.push({
      id: m.id,
      name: m.name ?? m.id,
      context: limit.context,
      input: limit.input ?? limit.context,
      output: limit.output ?? 0,
      toolCall: Boolean(m.tool_call),
      reasoning: Boolean(m.reasoning),
      attachment: Boolean(m.attachment),
      temperature: Boolean(m.temperature),
      modalities: m.modalities ?? { input: ["text"], output: ["text"] },
      cost: m.cost ?? null,
      status: m.status ?? "active",
    });
  }
  if (!models.length) continue;
  providers.push({
    id: p.id,
    name: p.name ?? p.id,
    protocol: protocolOf(p.npm),
    baseUrl: p.api ?? "",
    env: p.env ?? [],
    doc: p.doc ?? "",
    models,
  });
}

providers.sort((a, b) => a.id.localeCompare(b.id));
const snapshot = {
  source: "https://models.dev",
  generatedAt: new Date().toISOString(),
  providers,
};

const target = join(root, "apps", "web", "src", "assets");
mkdirSync(target, { recursive: true });
writeFileSync(
  join(target, "model-catalog.json"),
  JSON.stringify(snapshot),
);
const modelCount = providers.reduce((n, p) => n + p.models.length, 0);
console.log(
  `已生成模型目录快照：${providers.length} 供应商 / ${modelCount} 聊天模型`,
);