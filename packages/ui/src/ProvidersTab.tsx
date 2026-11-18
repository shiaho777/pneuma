import { useEffect, useMemo, useState } from "react";
import type {
  AIConfig,
  CatalogProvider,
  LLMProtocol,
  ModelSpec,
  ProviderConfig,
} from "@pneuma/protocol";
import {
  fetchRemoteModels,
  findModelMatches,
  findProvider,
  formatTokens,
  listPopularProviders,
  listProviders,
  providerModels,
  type CatalogMatch,
  type RemoteModel,
} from "@pneuma/core";

import iconOpenai from "./assets/provider-icons/model-provider-openai.png";
import iconAnthropic from "./assets/provider-icons/model-provider-anthropic.png";
import iconDeepseek from "./assets/provider-icons/model-provider-deepseek.png";
import iconSiliconflow from "./assets/provider-icons/model-provider-siliconflow.png";
import iconBigmodel from "./assets/provider-icons/logo-bigmodel.svg";
import iconMinimax from "./assets/provider-icons/model-provider-minimax.png";
import iconMimo from "./assets/provider-icons/model-provider-xiaomi-mimo.png";
import iconAlibaba from "./assets/provider-icons/model-provider-alibaba-cloud.png";
import iconKimi from "./assets/provider-icons/model-provider-moonshot-kimi.png";
import iconVolc from "./assets/provider-icons/model-provider-volcengine.png";
import iconGoogle from "./assets/provider-icons/brand-google.svg";
import iconAzure from "./assets/provider-icons/brand-azure.svg";
import iconBedrock from "./assets/provider-icons/brand-bedrock.svg";
import { IconEye, IconEyeOff, IconBack, IconTrash } from "./icons";

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
  { catalogId: "google", name: "Google", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com", icon: iconGoogle, initial: "G" },
  { catalogId: "azure", name: "Azure", protocol: "openai-compatible", baseUrl: "", icon: iconAzure, initial: "Az" },
  { catalogId: "amazon-bedrock", name: "Amazon Bedrock", protocol: "openai-compatible", baseUrl: "", icon: iconBedrock, initial: "B" },
  { catalogId: "deepseek", name: "DeepSeek", protocol: "openai-compatible", baseUrl: "https://api.deepseek.com", icon: iconDeepseek, initial: "D" },
  { catalogId: "siliconflow", name: "硅基流动", protocol: "openai-compatible", baseUrl: "https://api.siliconflow.cn/v1", icon: iconSiliconflow, initial: "硅" },
  { catalogId: "zhipuai", name: "智谱", protocol: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", icon: iconBigmodel, initial: "智" },
  { catalogId: "moonshotai", name: "Moonshot", protocol: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", icon: iconKimi, initial: "M" },
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

function validBaseUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
  const [draft, setDraft] = useState<ProviderConfig | null>(null);
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newProtocol, setNewProtocol] = useState<LLMProtocol>("openai-compatible");
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [matches, setMatches] = useState<CatalogMatch[]>([]);
  const [pending, setPending] = useState<CatalogMatch | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAllCatalog, setShowAllCatalog] = useState(false);
  const [catalogLimit, setCatalogLimit] = useState(48);
  const [browseModels, setBrowseModels] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const [modelLimit, setModelLimit] = useState(50);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[] | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteError, setRemoteError] = useState("");

  const saved = ai.providers.find((p) => p.id === detailId) ?? null;

  useEffect(() => {
    setDraft(saved ? { ...saved, models: saved.models.map((m) => ({ ...m })) } : null);
    setFormError("");
    setAdding(false);
    setPending(null);
    setMatches([]);
    setEditingModel(null);
    setBrowseModels(false);
    setModelFilter("");
    setModelLimit(50);
    setExpandedModel(null);
    setRemoteModels(null);
    setRemoteError("");
  }, [detailId]);

  const dirty =
    draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const catalogGrid = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q) {
      return listProviders()
        .filter((p) => p.id.includes(q) || p.name.toLowerCase().includes(q))
        .slice(0, catalogLimit);
    }
    if (showAllCatalog) return listProviders().slice(0, catalogLimit);
    return listPopularProviders();
  }, [filter, showAllCatalog, catalogLimit]);

  const openDetail = (id: string) => {
    if (dirty && !window.confirm("当前供应商有未保存的修改，放弃并切换？")) return;
    setDetailId(id);
  };

  const backToList = () => {
    if (dirty && !window.confirm("有未保存的修改，放弃并返回列表？")) return;
    setDetailId(null);
  };

  const validate = (p: ProviderConfig): string => {
    if (!p.name.trim()) return "名称不能为空";
    if (!validBaseUrl(p.baseUrl)) return "Base URL 必填，且需为 http(s) 地址";
    return "";
  };

  const saveDraft = () => {
    if (!draft) return;
    const err = validate(draft);
    if (err) {
      setFormError(err);
      return;
    }
    onChange({
      ...ai,
      providers: ai.providers.map((p) => (p.id === draft.id ? draft : p)),
    });
    setFormError("");
    notify(`已保存「${draft.name}」`);
  };

  const cancelDraft = () => {
    if (saved) setDraft({ ...saved, models: saved.models.map((m) => ({ ...m })) });
    setFormError("");
  };

  const createCustom = () => {
    const candidate: ProviderConfig = {
      id: "custom-" + Date.now(),
      name: newName.trim(),
      enabled: true,
      baseUrl: newBaseUrl.trim(),
      protocol: newProtocol,
      apiKey: newKey,
      models: [],
    };
    const err = validate(candidate);
    if (err) {
      setFormError(err);
      return;
    }
    onChange({ ...ai, providers: [...ai.providers, candidate] });
    setCreating(false);
    setNewName("");
    setNewBaseUrl("");
    setNewKey("");
    setNewProtocol("openai-compatible");
    setFormError("");
    setDetailId(candidate.id);
    notify(`已创建「${candidate.name}」，添加模型后即可使用`);
  };

  const addProviderFromCatalog = (cp: CatalogProvider) => {
    const existing = ai.providers.find((p) => p.catalogProviderId === cp.id);
    if (existing) {
      openDetail(existing.id);
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
      openDetail(existing.id);
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

  const removeProvider = () => {
    if (!draft) return;
    if (!window.confirm(`删除供应商「${draft.name}」？其模型配置将一并移除。`)) return;
    onChange({
      ...ai,
      providers: ai.providers.filter((p) => p.id !== draft.id),
      active: ai.active?.providerId === draft.id ? null : ai.active,
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
    if (!draft || !pending) return;
    const { provider: cp, model } = pending;
    const models = draft.models.some((m) => m.id === model.id)
      ? draft.models.map((m) =>
          m.id === model.id ? { ...m, spec: model, enabled: true } : m,
        )
      : [...draft.models, { id: model.id, enabled: true, spec: model }];
    const next: ProviderConfig = {
      ...draft,
      models,
      baseUrl: draft.baseUrl || cp.baseUrl,
      protocol: cp.protocol,
      catalogProviderId: draft.catalogProviderId ?? cp.id,
    };
    setDraft(next);
    onChange({
      ...ai,
      providers: ai.providers.map((p) => (p.id === next.id ? next : p)),
      active: { providerId: next.id, modelId: model.id },
    });
    setPending(null);
    setAdding(false);
    setDraftId("");
    setMatches([]);
    notify(`已对齐「${model.id}」：上下文 ${formatTokens(model.context)} / 输出 ${formatTokens(model.output)}`);
  };

  const addManual = () => {
    if (!draft || !draftId.trim()) return;
    const id = draftId.trim();
    if (draft.models.some((m) => m.id === id)) return;
    setDraft({ ...draft, models: [...draft.models, { id, enabled: true }] });
    setAdding(false);
    setDraftId("");
    setMatches([]);
  };

  const addCatalogModel = (model: ModelSpec) => {
    if (!draft) return;
    const models = draft.models.some((m) => m.id === model.id)
      ? draft.models.map((m) =>
          m.id === model.id ? { ...m, spec: model, enabled: true } : m,
        )
      : [...draft.models, { id: model.id, enabled: true, spec: model }];
    setDraft({ ...draft, models });
    notify(`已添加「${model.id}」（上下文 ${formatTokens(model.context)}）`);
  };

  const pullRemote = async () => {
    if (!draft) return;
    setRemoteBusy(true);
    setRemoteError("");
    try {
      const list = await fetchRemoteModels(
        draft.baseUrl,
        draft.apiKey,
        draft.protocol,
      );
      setRemoteModels(list);
      notify(`拉取到 ${list.length} 个在线模型`);
    } catch (e) {
      setRemoteError(String(e));
    }
    setRemoteBusy(false);
  };

  const addRemoteModel = (rm: RemoteModel) => {
    if (!draft) return;
    const spec: ModelSpec | undefined = rm.context
      ? {
          id: rm.id,
          name: rm.name ?? rm.id,
          context: rm.context,
          input: rm.context,
          output: rm.output ?? 0,
          toolCall: true,
          reasoning: false,
          attachment: false,
          temperature: true,
          modalities: { input: ["text"], output: ["text"] },
          cost: null,
          status: "active",
        }
      : undefined;
    const models = draft.models.some((m) => m.id === rm.id)
      ? draft.models
      : [...draft.models, { id: rm.id, enabled: true, spec }];
    setDraft({ ...draft, models });
    notify(`已添加在线模型「${rm.id}」`);
  };

  if (draft) {
    const catalogProvider = draft.catalogProviderId
      ? findProvider(draft.catalogProviderId)
      : undefined;
    const browseList = (
      catalogProvider ? providerModels(catalogProvider.id) : []
    ).filter((m) =>
      modelFilter.trim()
        ? m.id.toLowerCase().includes(modelFilter.trim().toLowerCase())
        : true,
    );
    return (
      <section className="settings-section">
        <div className="row">
          <button className="ghost tiny" onClick={backToList}>
            <IconBack size={13} /> 供应商列表
          </button>
          {dirty && <span className="badge warn">未保存</span>}
          <span className="spacer" />
          <button className="ghost tiny" onClick={removeProvider}>
            <IconTrash size={13} /> 删除供应商
          </button>
        </div>
        <label className="field">
          名称 *
          <input
            className="provider-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          Base URL *
          <input
            value={draft.baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          />
        </label>
        <label className="field">
          API 格式
          <select
            value={draft.protocol}
            onChange={(e) =>
              setDraft({ ...draft, protocol: e.target.value as LLMProtocol })
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
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            />
            <button
              className="ghost tiny"
              title={showKey ? "隐藏" : "显示"}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            </button>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          启用该供应商
        </label>
        {formError && <div className="badge warn">{formError}</div>}
        <div className="row">
          <button className="send tiny" onClick={saveDraft}>
            保存
          </button>
          <button className="ghost tiny" disabled={!dirty} onClick={cancelDraft}>
            取消修改
          </button>
        </div>

        <div className="row">
          <span className="name">模型列表</span>
          <button className="send tiny" onClick={() => setAdding(true)}>
            ＋ 添加模型
          </button>
          {catalogProvider && (
            <button
              className="ghost tiny"
              onClick={() => setBrowseModels((v) => !v)}
            >
              目录模型（{catalogProvider.models.length}）
            </button>
          )}
          <button className="ghost tiny" disabled={remoteBusy} onClick={pullRemote}>
            {remoteBusy ? "拉取中…" : "拉取在线模型"}
          </button>
        </div>
        {remoteError && <div className="badge warn">{remoteError}</div>}
        {remoteModels && (
          <div className="align-panel">
            <div className="name">在线模型（{remoteModels.length}）· 点击添加</div>
            {remoteModels.slice(0, 100).map((rm) => (
              <div key={rm.id} className="model-row">
                <span className="name">{rm.id}</span>
                {rm.context ? (
                  <span className="badge">{formatTokens(rm.context)}</span>
                ) : null}
                <span className="spacer" />
                <button className="ghost tiny" onClick={() => addRemoteModel(rm)}>
                  添加
                </button>
              </div>
            ))}
            {remoteModels.length > 100 && (
              <div className="meta">仅显示前 100 个，可用「＋ 添加模型」输入 ID 精确添加。</div>
            )}
          </div>
        )}
        {browseModels && catalogProvider && (
          <div className="align-panel">
            <div className="row">
              <span className="name">
                {catalogProvider.name} 目录模型（{browseList.length}）
              </span>
              <input
                className="provider-name"
                value={modelFilter}
                placeholder="过滤模型 ID"
                onChange={(e) => {
                  setModelFilter(e.target.value);
                  setModelLimit(50);
                }}
              />
            </div>
            {browseList.slice(0, modelLimit).map((m) => (
              <div key={m.id} className="model-row-wrap">
                <div className="model-row">
                  <button
                    className="ghost tiny"
                    onClick={() =>
                      setExpandedModel(expandedModel === m.id ? null : m.id)
                    }
                  >
                    {expandedModel === m.id ? "收起" : "详情"}
                  </button>
                  <span className="name">{m.id}</span>
                  <span className="badge">{formatTokens(m.context)}</span>
                  {m.reasoning && <span className="badge">推理</span>}
                  {m.toolCall && <span className="badge">工具</span>}
                  {m.status === "deprecated" && (
                    <span className="badge warn">弃用</span>
                  )}
                  <span className="spacer" />
                  <button
                    className="send tiny"
                    onClick={() => addCatalogModel(m)}
                  >
                    添加
                  </button>
                </div>
                {expandedModel === m.id && (
                  <div className="spec-card">
                    <div className="spec-grid">
                      <span>名称 {m.name}</span>
                      <span>家族 {m.family || "—"}</span>
                      <span>上下文 {formatTokens(m.context)}</span>
                      <span>最大输入 {formatTokens(m.input)}</span>
                      <span>最大输出 {formatTokens(m.output)}</span>
                      <span>工具 {m.toolCall ? "支持" : "不支持"}</span>
                      <span>推理 {m.reasoning ? "是" : "否"}</span>
                      <span>视觉 {m.attachment ? "是" : "否"}</span>
                      <span>温度 {m.temperature ? "支持" : "不支持"}</span>
                      <span>结构化输出 {m.structuredOutput ? "是" : "否"}</span>
                      <span>开放权重 {m.openWeights ? "是" : "否"}</span>
                      <span>状态 {m.status}</span>
                      <span>
                        模态 {m.modalities.input.join("/")} →{" "}
                        {m.modalities.output.join("/")}
                      </span>
                      <span>发布 {m.releaseDate || "—"}</span>
                      <span>更新 {m.lastUpdated || "—"}</span>
                      {m.cost && (
                        <span>
                          成本 ${m.cost.input ?? "?"}/${m.cost.output ?? "?"}
                          {m.cost.cache_read != null
                            ? `（缓存读 $${m.cost.cache_read}）`
                            : ""}{" "}
                          每百万 token
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <div className="meta">{m.description}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {browseList.length > modelLimit && (
              <button
                className="ghost tiny"
                onClick={() => setModelLimit((n) => n + 100)}
              >
                加载更多（剩余 {browseList.length - modelLimit}）
              </button>
            )}
          </div>
        )}

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

        {draft.models.map((m) => (
          <div key={m.id} className="model-row">
            <button
              className={`ghost tiny ${ai.active?.providerId === draft.id && ai.active.modelId === m.id ? "active-match" : ""}`}
              title="设为当前使用模型"
              onClick={() =>
                onChange({
                  ...ai,
                  active: { providerId: draft.id, modelId: m.id },
                })
              }
            >
              📌
            </button>
            {editingModel === m.id ? (
              <input
                className="provider-name"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const next = editValue.trim();
                    if (next && next !== m.id) {
                      setDraft({
                        ...draft,
                        models: draft.models.map((x) =>
                          x.id === m.id ? { ...x, id: next } : x,
                        ),
                      });
                    }
                    setEditingModel(null);
                  }
                  if (e.key === "Escape") setEditingModel(null);
                }}
              />
            ) : (
              <span className="name">{m.id}</span>
            )}
            {m.spec && <span className="badge">{formatTokens(m.spec.context)}</span>}
            {m.spec && !m.spec.toolCall && <span className="badge warn">文本降级</span>}
            <span className="spacer" />
            {editingModel === m.id ? (
              <button
                className="ghost tiny"
                onClick={() => {
                  const next = editValue.trim();
                  if (next && next !== m.id) {
                    setDraft({
                      ...draft,
                      models: draft.models.map((x) =>
                        x.id === m.id ? { ...x, id: next } : x,
                      ),
                    });
                  }
                  setEditingModel(null);
                }}
              >
                确定
              </button>
            ) : (
              <button
                className="ghost tiny"
                onClick={() => {
                  setEditingModel(m.id);
                  setEditValue(m.id);
                }}
              >
                编辑
              </button>
            )}
            <button
              className="ghost tiny"
              onClick={() =>
                setDraft({
                  ...draft,
                  models: draft.models.filter((x) => x.id !== m.id),
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
                  setDraft({
                    ...draft,
                    models: draft.models.map((x) =>
                      x.id === m.id ? { ...x, enabled: e.target.checked } : x,
                    ),
                  })
                }
              />
            </label>
          </div>
        ))}
        {!draft.models.length && (
          <div className="meta">还没有模型，点「＋ 添加模型」输入 ID 自动对齐。</div>
        )}
      </section>
    );
  }

  return (
    <section className="settings-section">
      <p className="meta">
        密钥只保存在本机浏览器存储，请求直连你填写的接口，不经过任何项目服务器。模型规格来自 models.dev 目录快照。自定义供应商需填写必填项并保存后才创建。
      </p>
      <div className="row">
        <button
          className={`ghost tiny ${ai.active === null ? "active-match" : ""}`}
          onClick={() => onChange({ ...ai, active: null })}
        >
          本地演示（无需接口）
        </button>
        <button
          className="send tiny"
          onClick={() => {
            setCreating(true);
            setFormError("");
          }}
        >
          ＋ 创建自定义供应商
        </button>
      </div>

      {creating && (
        <div className="align-panel">
          <div className="name">创建自定义供应商（* 必填，保存后才创建）</div>
          <label className="field">
            名称 *
            <input
              value={newName}
              placeholder="如：我的中转站"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="field">
            Base URL *
            <input
              value={newBaseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setNewBaseUrl(e.target.value)}
            />
          </label>
          <label className="field">
            API 格式
            <select
              value={newProtocol}
              onChange={(e) => setNewProtocol(e.target.value as LLMProtocol)}
            >
              {(Object.keys(PROTOCOL_LABEL) as LLMProtocol[]).map((p) => (
                <option key={p} value={p}>
                  {PROTOCOL_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            API Key（可稍后在详情填写）
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </label>
          {formError && <div className="badge warn">{formError}</div>}
          <div className="row">
            <button className="send tiny" onClick={createCustom}>
              保存并创建
            </button>
            <button
              className="ghost tiny"
              onClick={() => {
                setCreating(false);
                setFormError("");
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

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
        <button key={p.id} className="preset" onClick={() => openDetail(p.id)}>
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
          onChange={(e) => {
            setFilter(e.target.value);
            setCatalogLimit(48);
          }}
        />
      </label>
      <div className="row">
        <button
          className={`ghost tiny ${!showAllCatalog && !filter ? "active-match" : ""}`}
          onClick={() => setShowAllCatalog(false)}
        >
          热门
        </button>
        <button
          className={`ghost tiny ${showAllCatalog ? "active-match" : ""}`}
          onClick={() => setShowAllCatalog(true)}
        >
          全部（{listProviders().length}）
        </button>
      </div>
      <div className="catalog-grid">
        {catalogGrid.map((cp) => (
          <button
            key={cp.id}
            className="ghost tiny catalog-chip"
            onClick={() => addProviderFromCatalog(cp)}
          >
            {cp.name}
          </button>
        ))}
      </div>
      {(showAllCatalog || filter) &&
        catalogGrid.length < listProviders().length && (
          <button
            className="ghost tiny"
            onClick={() => setCatalogLimit((n) => n + 96)}
          >
            加载更多供应商
          </button>
        )}
    </section>
  );
}