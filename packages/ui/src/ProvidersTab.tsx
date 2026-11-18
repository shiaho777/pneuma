import { useMemo, useState } from "react";
import type {
  AIConfig,
  CatalogProvider,
  LLMProtocol,
  ProviderConfig,
  ProviderModel,
} from "@pneuma/protocol";
import {
  findModelMatches,
  findProvider,
  formatTokens,
  listProviders,
  type CatalogMatch,
} from "@pneuma/core";

import iconOpenai from "./assets/provider-icons/model-provider-openai.png";
import iconAnthropic from "./assets/provider-icons/model-provider-anthropic.png";
import iconDeepseek from "./assets/provider-icons/model-provider-deepseek.png";
import iconSiliconflow from "./assets/provider-icons/model-provider-siliconflow.png";
import iconBigmodel from "./assets/provider-icons/logo-bigmodel.svg";
import iconMoonshot from "./assets/provider-icons/logo-moonshoot.svg";
import iconMinimax from "./assets/provider-icons/model-provider-minimax.png";
import iconMimo from "./assets/provider-icons/model-provider-xiaomi-mimo.png";
import iconAlibaba from "./assets/provider-icons/model-provider-alibaba-cloud.png";
import iconKimi from "./assets/provider-icons/model-provider-moonshot-kimi.png";
import iconVolc from "./assets/provider-icons/model-provider-volcengine.png";

const PROTOCOL_LABEL: Record<LLMProtocol, string> = {
  "openai-compatible": "Chat Completions (/chat/completions)",
  anthropic: "Anthropic Messages (/v1/messages)",
  gemini: "Gemini (streamGenerateContent)",
};

interface PresetProvider {
  catalogId?: string;
  name: string;
  protocol: LLMProtocol;
  baseUrl: string;
  icon?: string;
  initial: string;
}

const PRESET_PROVIDERS: PresetProvider[] = [
  { catalogId: "openai", name: "OpenAI", protocol: "openai-compatible", baseUrl: "https://api.openai.com/v1", icon: iconOpenai, initial: "O" },
  { catalogId: "anthropic", name: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com", icon: iconAnthropic, initial: "A" },
  { catalogId: "google", name: "Google", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com", initial: "G" },
  { catalogId: "azure", name: "Azure", protocol: "openai-compatible", baseUrl: "", initial: "Az" },
  { catalogId: "amazon-bedrock", name: "Amazon Bedrock", protocol: "openai-compatible", baseUrl: "", initial: "B" },
  { catalogId: "deepseek", name: "DeepSeek", protocol: "openai-compatible", baseUrl: "https://api.deepseek.com", icon: iconDeepseek, initial: "D" },
  { catalogId: "siliconflow", name: "硅基流动", protocol: "openai-compatible", baseUrl: "https://api.siliconflow.cn/v1", icon: iconSiliconflow, initial: "硅" },
  { catalogId: "zhipu", name: "智谱", protocol: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", icon: iconBigmodel, initial: "智" },
  { catalogId: "moonshot", name: "Moonshot", protocol: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", icon: iconMoonshot, initial: "M" },
  { catalogId: "minimax", name: "MiniMax", protocol: "openai-compatible", baseUrl: "https://api.minimaxi.com/v1", icon: iconMinimax, initial: "M" },
  { catalogId: "xiaomi", name: "小米 MiMo", protocol: "openai-compatible", baseUrl: "", icon: iconMimo, initial: "Mi" },
  { catalogId: "alibaba", name: "阿里云百炼", protocol: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", icon: iconAlibaba, initial: "百" },
  { catalogId: "kimi", name: "Kimi", protocol: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", icon: iconKimi, initial: "K" },
  { catalogId: "volcengine", name: "火山引擎", protocol: "openai-compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", icon: iconVolc, initial: "火" },
];

const ICON_BY_CATALOG: Record<string, string> = Object.fromEntries(
  PRESET_PROVIDERS.filter((p) => p.catalogId && p.icon).map((p) => [
    p.catalogId as string,
    p.icon as string,
  ]),
);

export function ProvidersTab({
  ai,
  onChange,
  notify,
}: {
  ai: AIConfig;
  onChange: (next: AIConfig) => void;
  notify: (text: string) => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [matches, setMatches] = useState<CatalogMatch[]>([]);
  const [pending, setPending] = useState<CatalogMatch | null>(null);

  const detail = ai.providers.find((p) => p.id === detailId) ?? null;

  const catalogGrid = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = listProviders();
    if (!q) return all.slice(0, 24);
    return all
      .filter((p) => p.id.includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 24);
  }, [filter]);

  const patchProvider = (id: string, patch: Partial<ProviderConfig>) => {
    onChange({
      ...ai,
      providers: ai.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const patchModel = (
    providerId: string,
    modelId: string,
    patch: Partial<ProviderModel>,
  ) => {
    const provider = ai.providers.find((p) => p.id === providerId);
    if (!provider) return;
    patchProvider(providerId, {
      models: provider.models.map((m) =>
        m.id === modelId ? { ...m, ...patch } : m,
      ),
    });
  };

  const addProviderFromCatalog = (cp: CatalogProvider) => {
    const existing = ai.providers.find((p) => p.catalogProviderId === cp.id);
    if (existing) {
      setDetailId(existing.id);
      return;
    }
    const provider: ProviderConfig = {
      id: "prov-" + Date.now(),
      name: cp.name,
      enabled: true,
      baseUrl: cp.baseUrl,
      protocol: cp.protocol,
      apiKey: "",
      models: [],
      catalogProviderId: cp.id,
    };
    onChange({ ...ai, providers: [...ai.providers, provider] });
    setDetailId(provider.id);
  };

  const addPresetProvider = (preset: PresetProvider) => {
    const existing = ai.providers.find(
      (p) => p.catalogProviderId === preset.catalogId || p.name === preset.name,
    );
    if (existing) {
      setDetailId(existing.id);
      return;
    }
    const cp = preset.catalogId ? findProvider(preset.catalogId) : undefined;
    const provider: ProviderConfig = {
      id: "prov-" + Date.now(),
      name: preset.name,
      enabled: true,
      baseUrl: preset.baseUrl || cp?.baseUrl || "",
      protocol: cp?.protocol ?? preset.protocol,
      apiKey: "",
      models: [],
      catalogProviderId: preset.catalogId,
    };
    onChange({ ...ai, providers: [...ai.providers, provider] });
    setDetailId(provider.id);
  };

  const addCustomProvider = () => {
    const provider: ProviderConfig = {
      id: "custom-" + Date.now(),
      name: "新供应商",
      enabled: true,
      baseUrl: "",
      protocol: "openai-compatible",
      apiKey: "",
      models: [],
    };
    onChange({ ...ai, providers: [...ai.providers, provider] });
    setDetailId(provider.id);
  };

  const removeProvider = (id: string) => {
    onChange({
      ...ai,
      providers: ai.providers.filter((p) => p.id !== id),
      active: ai.active?.providerId === id ? null : ai.active,
    });
    setDetailId(null);
  };

  const searchModel = () => {
    const found = findModelMatches(draftId);
    setMatches(found);
    setPending(found[0] ?? null);
    if (!found.length) notify("目录中未找到该模型，可手动添加（无规格对齐）");
  };

  const confirmAlign = () => {
    if (!detail || !pending) return;
    const { provider: cp, model } = pending;
    const models = detail.models.some((m) => m.id === model.id)
      ? detail.models.map((m) =>
          m.id === model.id ? { ...m, spec: model, enabled: true } : m,
        )
      : [...detail.models, { id: model.id, enabled: true, spec: model }];
    onChange({
      ...ai,
      providers: ai.providers.map((p) =>
        p.id === detail.id
          ? {
              ...p,
              models,
              baseUrl: p.baseUrl || cp.baseUrl,
              protocol: cp.protocol,
              catalogProviderId: p.catalogProviderId ?? cp.id,
            }
          : p,
      ),
      active: { providerId: detail.id, modelId: model.id },
    });
    setPending(null);
    setAdding(false);
    setDraftId("");
    setMatches([]);
    notify(`已对齐「${model.id}」：上下文 ${formatTokens(model.context)} / 输出 ${formatTokens(model.output)}`);
  };

  const addManual = () => {
    if (!detail || !draftId.trim()) return;
    const id = draftId.trim();
    if (detail.models.some((m) => m.id === id)) return;
    patchProvider(detail.id, {
      models: [...detail.models, { id, enabled: true }],
    });
    setAdding(false);
    setDraftId("");
    setMatches([]);
  };

  if (detail) {
    return (
      <section className="settings-section">
        <div className="row">
          <button className="ghost tiny" onClick={() => setDetailId(null)}>
            ← 供应商列表
          </button>
          <input
            className="provider-name"
            value={detail.name}
            onChange={(e) => patchProvider(detail.id, { name: e.target.value })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={detail.enabled}
              onChange={(e) =>
                patchProvider(detail.id, { enabled: e.target.checked })
              }
            />
            启用
          </label>
          <button className="ghost tiny" onClick={() => removeProvider(detail.id)}>
            删除供应商
          </button>
        </div>
        <label className="field">
          Base URL
          <input
            value={detail.baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(e) => patchProvider(detail.id, { baseUrl: e.target.value })}
          />
        </label>
        <label className="field">
          API 格式
          <select
            value={detail.protocol}
            onChange={(e) =>
              patchProvider(detail.id, {
                protocol: e.target.value as LLMProtocol,
              })
            }
          >
            {(Object.keys(PROTOCOL_LABEL) as LLMProtocol[]).map((p) => (
              <option key={p} value={p}>
                {PROTOCOL_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          API Key
          <span className="key-row">
            <input
              type={showKey ? "text" : "password"}
              value={detail.apiKey}
              onChange={(e) => patchProvider(detail.id, { apiKey: e.target.value })}
            />
            <button className="ghost tiny" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "隐藏" : "显示"}
            </button>
          </span>
        </label>

        <div className="row">
          <span className="name">模型列表</span>
          <button className="send tiny" onClick={() => setAdding(true)}>
            ＋ 添加模型
          </button>
        </div>

        {adding && (
          <div className="align-panel">
            <label className="field">
              模型 ID（输入后自动检索 models.dev 目录对齐配置）
              <span className="key-row">
                <input
                  value={draftId}
                  placeholder="如 qwen3-max / claude-sonnet-4-5 / gpt-5"
                  onChange={(e) => setDraftId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchModel()}
                />
                <button className="send tiny" onClick={searchModel}>
                  检索
                </button>
              </span>
            </label>
            {matches.length > 1 && (
              <div className="match-list">
                {matches.map((m) => (
                  <button
                    key={m.provider.id + "/" + m.model.id}
                    className={`ghost tiny ${pending === m ? "active-match" : ""}`}
                    onClick={() => setPending(m)}
                  >
                    {m.provider.name} · {m.model.id}
                  </button>
                ))}
              </div>
            )}
            {pending && (
              <div className="spec-card">
                <div className="name">
                  对齐确认 · {pending.provider.name} / {pending.model.id}
                </div>
                <div className="spec-grid">
                  <span>上下文 {formatTokens(pending.model.context)}</span>
                  <span>最大输入 {formatTokens(pending.model.input)}</span>
                  <span>最大输出 {formatTokens(pending.model.output)}</span>
                  <span>工具调用 {pending.model.toolCall ? "支持" : "不支持→文本降级"}</span>
                  <span>推理 {pending.model.reasoning ? "是" : "否"}</span>
                  <span>视觉 {pending.model.attachment ? "是" : "否"}</span>
                  <span>温度 {pending.model.temperature ? "支持" : "不支持"}</span>
                  <span>
                    模态 {pending.model.modalities.input.join("/")} →{" "}
                    {pending.model.modalities.output.join("/")}
                  </span>
                  {pending.model.cost && (
                    <span>
                      成本 ${pending.model.cost.input ?? "?"}/${pending.model.cost.output ?? "?"} 每百万 token
                    </span>
                  )}
                </div>
                <div className="meta">
                  确认后：Base URL 与 API 格式按供应商默认对齐（可改），上下文/输出上限接入提示词装配与请求参数。
                </div>
                <div className="row">
                  <button className="send tiny" onClick={confirmAlign}>
                    确认对齐
                  </button>
                  <button className="ghost tiny" onClick={() => setPending(null)}>
                    取消
                  </button>
                </div>
              </div>
            )}
            {!pending && matches.length === 0 && draftId.trim() && (
              <div className="row">
                <button className="ghost tiny" onClick={addManual}>
                  手动添加（无规格）
                </button>
                <button className="ghost tiny" onClick={() => setAdding(false)}>
                  取消
                </button>
              </div>
            )}
          </div>
        )}

        {detail.models.map((m) => (
          <div key={m.id} className="model-row">
            <button
              className={`ghost tiny ${ai.active?.providerId === detail.id && ai.active.modelId === m.id ? "active-match" : ""}`}
              title="设为当前使用模型"
              onClick={() =>
                onChange({
                  ...ai,
                  active: { providerId: detail.id, modelId: m.id },
                })
              }
            >
              📌
            </button>
            <span className="name">{m.id}</span>
            {m.spec && <span className="badge">{formatTokens(m.spec.context)}</span>}
            {m.spec && !m.spec.toolCall && <span className="badge warn">文本降级</span>}
            <span className="spacer" />
            <button
              className="ghost tiny"
              onClick={() => {
                const next = prompt("编辑模型 ID", m.id);
                if (next && next !== m.id) {
                  patchProvider(detail.id, {
                    models: detail.models.map((x) =>
                      x.id === m.id ? { ...x, id: next } : x,
                    ),
                  });
                }
              }}
            >
              编辑
            </button>
            <button
              className="ghost tiny"
              onClick={() =>
                patchProvider(detail.id, {
                  models: detail.models.filter((x) => x.id !== m.id),
                })
              }
            >
              删除
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) =>
                  patchModel(detail.id, m.id, { enabled: e.target.checked })
                }
              />
            </label>
          </div>
        ))}
        {!detail.models.length && (
          <div className="meta">还没有模型，点「＋ 添加模型」输入 ID 自动对齐。</div>
        )}
      </section>
    );
  }

  return (
    <section className="settings-section">
      <p className="meta">
        密钥只保存在本机浏览器存储，请求直连你填写的接口，不经过任何项目服务器。模型规格来自 models.dev 目录快照。
      </p>
      <div className="row">
        <button
          className={`ghost tiny ${ai.active === null ? "active-match" : ""}`}
          onClick={() => onChange({ ...ai, active: null })}
        >
          本地演示（无需接口）
        </button>
        <button className="send tiny" onClick={addCustomProvider}>
          ＋ 创建自定义供应商
        </button>
      </div>
      <div className="preset-grid">
        {PRESET_PROVIDERS.map((pp) => (
          <button
            key={pp.name}
            className="preset-chip"
            onClick={() => addPresetProvider(pp)}
          >
            {pp.icon ? (
              <img src={pp.icon} alt="" className="provider-icon" />
            ) : (
              <span className="provider-icon fallback">{pp.initial}</span>
            )}
            <span>{pp.name}</span>
          </button>
        ))}
      </div>
      {ai.providers.map((p) => (
        <button key={p.id} className="preset" onClick={() => setDetailId(p.id)}>
          <span className="name">
            {p.catalogProviderId && ICON_BY_CATALOG[p.catalogProviderId] && (
              <img
                src={ICON_BY_CATALOG[p.catalogProviderId]}
                alt=""
                className="provider-icon"
              />
            )}
            {p.name} {p.enabled ? "" : "（停用）"}
          </span>
          <span className="statusline">
            {PROTOCOL_LABEL[p.protocol]} · {p.models.length} 个模型
            {ai.active?.providerId === p.id ? " · 当前使用" : ""}
          </span>
        </button>
      ))}
      <label className="field">
        从目录添加供应商（{listProviders().length} 家）
        <input
          value={filter}
          placeholder="搜索供应商，如 alibaba / deepseek / openrouter"
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <div className="catalog-grid">
        {catalogGrid.map((cp) => (
          <button
            key={cp.id}
            className="ghost tiny catalog-chip"
            onClick={() => addProviderFromCatalog(cp)}
          >
            {ICON_BY_CATALOG[cp.id] && (
              <img src={ICON_BY_CATALOG[cp.id]} alt="" className="provider-icon" />
            )}
            {cp.name}
          </button>
        ))}
      </div>
    </section>
  );
}