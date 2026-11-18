import { useEffect, useRef, useState } from "react";
import type {
  AgentDefinition,
  AIConfig,
  ChatMessage,
  LLMProviderConfig,
  MemoryItem,
  Moment,
  PromptLayer,
  PromptLayerId,
  RuntimeEvent,
  Session,
} from "@pneuma/protocol";
import {
  AgentRuntime,
  BUILTIN_TOOLS,
  EventBus,
  MemoryStore,
  PlazaEngine,
  PRESETS,
  agentFromPack,
  buildPersonaPack,
  importCharacterFile,
  instantiatePreset,
  parsePersonaPack,
  checkForUpdate,
  setCatalog,
  type PneumaStorage,
  type UpdateState,
} from "@pneuma/core";
import { Onboarding } from "./Onboarding";
import { SettingsCenter, type Theme } from "./SettingsCenter";
import { ChangelogModal } from "./ChangelogModal";
import { Toasts, toast } from "./Toast";
import {
  IconChat,
  IconUsers,
  IconGear,
  IconPlus,
  IconUpload,
  IconDownload,
  IconSend,
  IconStop,
  IconSliders,
  IconHeart,
  IconSpark,
  IconWind,
} from "./icons";

const DEMO_AGENT: AgentDefinition = {
  id: "demo",
  name: "小 pneuma",
  persona:
    "你是一个温柔、细腻、说话像活人的角色。话碎、会关心人、记得住小事。",
  style: "短句连发；偶尔状态行；不客服腔。",
  tools: BUILTIN_TOOLS.map((t) => t.name),
};

const DEMO_AGENT_2: AgentDefinition = {
  id: "demo2",
  name: "阿澜",
  persona:
    "你是阿澜，安静、爱观察、说话短但准。喜欢海和旧书，偶尔冷幽默。",
  style: "短句；不主动长篇；被点名才多说两句。",
  tools: BUILTIN_TOOLS.map((t) => t.name),
};

const DEFAULT_CONFIG: LLMProviderConfig = { id: "default", protocol: "mock" };

export function App({ storage }: { storage?: PneumaStorage }) {
  const [agents, setAgents] = useState<AgentDefinition[]>([
    DEMO_AGENT,
    DEMO_AGENT_2,
  ]);
  const [sessions, setSessions] = useState<Session[]>([
    { id: "s-demo", participantIds: ["demo"], title: "小 pneuma", createdAt: 0 },
  ]);
  const [activeSessionId, setActiveSessionId] = useState("s-demo");
  const [view, setView] = useState<"chat" | "plaza">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState("");
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [layers, setLayers] = useState<PromptLayer[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [config, setConfig] = useState<LLMProviderConfig>(DEFAULT_CONFIG);
  const [ai, setAI] = useState<AIConfig>({ providers: [], active: null });
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [silence, setSilence] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [presetModal, setPresetModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [updateState, setUpdateState] = useState<UpdateState>({});
  const [changelog, setChangelog] = useState<{
    version: string;
    notes: string;
    url?: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const packFileRef = useRef<HTMLInputElement>(null);

  const session =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const participants = session.participantIds
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AgentDefinition => Boolean(a));
  const agent = participants[0] ?? agents[0];
  const isGroup = participants.length > 1;

  const activeProvider = ai.active
    ? ai.providers.find((p) => p.id === ai.active!.providerId)
    : undefined;
  const activeModel = activeProvider?.models.find(
    (m) => m.id === ai.active?.modelId && m.enabled,
  );
  const effectiveConfig: LLMProviderConfig =
    activeProvider && activeModel
      ? {
          id: activeProvider.id,
          protocol: activeProvider.protocol,
          baseUrl: activeProvider.baseUrl,
          apiKey: activeProvider.apiKey,
          model: activeModel.id,
          spec: activeModel.spec,
        }
      : DEFAULT_CONFIG;

  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const memoryRef = useRef(new MemoryStore());
  const busRef = useRef(new EventBus());
  const plazaRef = useRef<PlazaEngine | null>(null);
  const runtimeRef = useRef<AgentRuntime | null>(null);

  const syncMoments = () => setMoments(plazaRef.current?.all() ?? []);

  if (!runtimeRef.current) {
    const emit = (e: RuntimeEvent) => {
      switch (e.type) {
        case "message.delta":
          setPending((p) => p + e.delta);
          break;
        case "message.completed":
          setMessages((m) => [...m, e.message]);
          setPending("");
          void storage?.saveMessage(e.message);
          break;
        case "status.updated":
          setStatusMap((s) => ({ ...s, [e.agentId]: e.text }));
          break;
        case "memory.added": {
          const item = memoryRef.current.all().find((i) => i.id === e.itemId);
          setMemories(memoryRef.current.all());
          if (item) void storage?.saveMemory(item);
          break;
        }
        case "prompt.assembled":
          setLayers(e.layers);
          setTotalTokens(e.totalTokens);
          break;
        case "group.silent": {
          const silentName =
            agentsRef.current.find((a) => a.id === e.agentId)?.name ??
            e.agentId;
          setSilence((s) => (s ? s + "；" : "") + `${silentName} 沉默`);
          break;
        }
        case "moment.posted":
        case "moment.commented":
          syncMoments();
          break;
        case "run.failed":
          setPending("");
          toast("连接出了点问题：" + e.error, true);
          break;
        default:
          break;
      }
    };
    plazaRef.current = new PlazaEngine({
      bus: busRef.current,
      emit,
      storage,
      config: DEFAULT_CONFIG,
    });
    runtimeRef.current = new AgentRuntime({
      memory: memoryRef.current,
      emit,
      bus: busRef.current,
      plaza: plazaRef.current,
    });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!storage) return;
      const [savedAgents, savedMemories, savedConfig, savedMoments, savedSessions] =
        await Promise.all([
          storage.loadAgents(),
          storage.loadMemories(),
          storage.loadConfig(),
          storage.loadMoments(),
          storage.loadSessions(),
        ]);
      if (!alive) return;
      const allAgents = savedAgents.length
        ? savedAgents
        : [DEMO_AGENT, DEMO_AGENT_2];
      setAgents(allAgents);
      if (savedSessions.length) {
        setSessions(savedSessions);
        setActiveSessionId(savedSessions[0].id);
      }
      for (const a of allAgents)
        for (const b of allAgents)
          if (a.id !== b.id) busRef.current.subscribe(a.id, b.id);
      memoryRef.current.restore(savedMemories);
      setMemories(savedMemories);
      if (savedConfig) setConfig(savedConfig);
      const savedAI = (await storage.getKV("aiConfig")) as AIConfig | undefined;
      if (savedAI) {
        setAI(savedAI);
      } else if (savedConfig && savedConfig.protocol !== "mock") {
        setAI({
          providers: [
            {
              id: "legacy",
              name: "自定义供应商",
              enabled: true,
              baseUrl: savedConfig.baseUrl ?? "",
              protocol: savedConfig.protocol,
              apiKey: savedConfig.apiKey ?? "",
              models: savedConfig.model
                ? [{ id: savedConfig.model, enabled: true }]
                : [],
            },
          ],
          active: savedConfig.model
            ? { providerId: "legacy", modelId: savedConfig.model }
            : null,
        });
      }
      const catalog = (await import(
        "../../../apps/web/src/assets/model-catalog.json"
      )) as { default?: unknown };
      setCatalog((catalog.default ?? catalog) as never);
      plazaRef.current!.restore(savedMoments);
      syncMoments();

      const seen = (await storage.getKV("onboardingSeen")) as boolean | undefined;
      if (!seen) setShowOnboarding(true);
      const savedTheme = (await storage.getKV("theme")) as Theme | undefined;
      if (savedTheme) setTheme(savedTheme);
      const savedMotion = (await storage.getKV("reduceMotion")) as
        | boolean
        | undefined;
      if (savedMotion) setReduceMotion(savedMotion);
      const savedAuto = (await storage.getKV("autoCheck")) as boolean | undefined;
      if (savedAuto !== undefined) setAutoCheck(savedAuto);
      const savedUpdate =
        ((await storage.getKV("updateState")) as UpdateState | undefined) ?? {};
      setUpdateState(savedUpdate);
      const lastSeen = (await storage.getKV("lastSeenVersion")) as
        | string
        | undefined;
      if (lastSeen && lastSeen !== __APP_VERSION__ && savedUpdate.latest) {
        setChangelog({
          version: savedUpdate.latest,
          notes: savedUpdate.notes ?? "",
          url: savedUpdate.url,
        });
      }
      void storage.setKV("lastSeenVersion", __APP_VERSION__);
      const auto = savedAuto ?? true;
      if (auto && __REPO__) {
        const result = await checkForUpdate(
          __REPO__,
          __APP_VERSION__,
          savedUpdate,
        );
        if (!alive) return;
        setUpdateState(result.state);
        void storage.setKV("updateState", result.state);
        if (result.status === "available" && result.latest) {
          setChangelog({
            version: result.latest,
            notes: result.notes ?? "",
            url: result.url,
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [storage]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = storage ? await storage.loadMessages(session.id) : [];
      if (!alive) return;
      setMessages(loaded);
      setSilence("");
      runtimeRef.current!.restoreHistory(session.id, loaded);
    })();
    return () => {
      alive = false;
    };
  }, [session.id, storage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.motion = reduceMotion ? "off" : "on";
  }, [theme, reduceMotion]);

  useEffect(() => {
    if (runtimeRef.current) {
      runtimeRef.current.deps.spec = effectiveConfig.spec
        ? {
            context: effectiveConfig.spec.context,
            output: effectiveConfig.spec.output,
          }
        : undefined;
    }
  }, [effectiveConfig.spec]);

  const nameOf = (id?: string) =>
    id === "user"
      ? "你"
      : agents.find((a) => a.id === id)?.name ?? id ?? "";

  const send = async () => {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setSilence("");
    setRunning(true);
    if (isGroup) {
      await runtimeRef.current!.sendGroup(
        session,
        participants,
        text,
        effectiveConfig,
      );
    } else {
      await runtimeRef.current!.send(session, agent, text, effectiveConfig);
    }
    setRunning(false);
  };

  const createGroup = () => {
    const picked = groupPick
      .map((id) => agents.find((a) => a.id === id))
      .filter((a): a is AgentDefinition => Boolean(a));
    if (picked.length < 2) return;
    const s: Session = {
      id: "g-" + Date.now(),
      participantIds: picked.map((a) => a.id),
      title: picked.map((a) => a.name).join("、"),
      createdAt: Date.now(),
    };
    setSessions((list) => [...list, s]);
    setActiveSessionId(s.id);
    void storage?.saveSession(s);
    setGroupModal(false);
    setGroupPick([]);
    setView("chat");
  };

  const onImport = async (file: File) => {
    try {
      const card = await importCharacterFile(file);
      setAgents((a) => [...a, card.agent]);
      for (const other of agents) {
        busRef.current.subscribe(card.agent.id, other.id);
        busRef.current.subscribe(other.id, card.agent.id);
      }
      const s: Session = {
        id: "s-" + card.agent.id,
        participantIds: [card.agent.id],
        title: card.agent.name,
        createdAt: Date.now(),
      };
      setSessions((list) => [...list, s]);
      setActiveSessionId(s.id);
      void storage?.saveAgent(card.agent);
      void storage?.saveSession(s);
      for (const lore of card.loreEntries.slice(0, 20)) {
        const item = memoryRef.current.add(
          "semantic",
          lore,
          0.5,
          false,
          card.agent.id,
        );
        void storage?.saveMemory(item);
      }
      setMemories(memoryRef.current.all());
      if (card.firstMes) {
        const greeting: ChatMessage = {
          id: "g-" + Date.now(),
          sessionId: s.id,
          role: "assistant",
          agentId: card.agent.id,
          content: card.firstMes,
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, greeting]);
        void storage?.saveMessage(greeting);
      }
      toast(`已导入「${card.agent.name}」`);
    } catch (err) {
      toast("导入失败：" + String(err), true);
    }
  };

  const registerAgents = (list: AgentDefinition[]) => {
    setAgents((a) => [...a, ...list]);
    const all = [...agents, ...list];
    for (const x of list)
      for (const y of all)
        if (x.id !== y.id) {
          busRef.current.subscribe(x.id, y.id);
          busRef.current.subscribe(y.id, x.id);
        }
    for (const a of list) void storage?.saveAgent(a);
  };

  const createFromPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const inst = instantiatePreset(preset);
    registerAgents(inst.agents);
    for (const seed of inst.memorySeed) {
      const item = memoryRef.current.add(
        "semantic",
        seed.text,
        seed.importance,
        false,
        seed.agentId,
      );
      void storage?.saveMemory(item);
    }
    setMemories(memoryRef.current.all());
    const s: Session = inst.group
      ? {
          id: "g-" + Date.now(),
          participantIds: inst.agents.map((a) => a.id),
          title: preset.label,
          createdAt: Date.now(),
        }
      : {
          id: "s-" + inst.agents[0].id,
          participantIds: [inst.agents[0].id],
          title: inst.agents[0].name,
          createdAt: Date.now(),
        };
    setSessions((list) => [...list, s]);
    setActiveSessionId(s.id);
    void storage?.saveSession(s);
    const greet = inst.firstMes[0];
    const greeting: ChatMessage = {
      id: "pg-" + Date.now(),
      sessionId: s.id,
      role: "assistant",
      agentId: greet.agentId,
      content: greet.text,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, greeting]);
    void storage?.saveMessage(greeting);
    setPresetModal(false);
    setView("chat");
    toast(`已按「${preset.label}」预设创建`);
  };

  const onPackImport = async (file: File) => {
    try {
      const pack = parsePersonaPack(JSON.parse(await file.text()));
      const a = agentFromPack(pack);
      registerAgents([a]);
      const s: Session = {
        id: "s-" + a.id,
        participantIds: [a.id],
        title: a.name,
        createdAt: Date.now(),
      };
      setSessions((list) => [...list, s]);
      setActiveSessionId(s.id);
      void storage?.saveSession(s);
      for (const seed of pack.memorySeed.slice(0, 30)) {
        const item = memoryRef.current.add(
          "semantic",
          seed.text,
          seed.importance,
          false,
          a.id,
        );
        void storage?.saveMemory(item);
      }
      setMemories(memoryRef.current.all());
      if (pack.firstMes) {
        const greeting: ChatMessage = {
          id: "pk-" + Date.now(),
          sessionId: s.id,
          role: "assistant",
          agentId: a.id,
          content: pack.firstMes,
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, greeting]);
        void storage?.saveMessage(greeting);
      }
      toast(`已导入人格包「${a.name}」`);
    } catch (err) {
      toast("人格包导入失败：" + String(err), true);
    }
  };

  const exportPack = () => {
    const seeds = agentMemories.map((m) => ({
      text: m.text,
      importance: m.importance,
    }));
    const pack = buildPersonaPack(agent, seeds);
    const blob = new Blob([JSON.stringify(pack, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${agent.name}.pneuma.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast(`已导出「${agent.name}」人格包`);
  };

  const updateAgent = (patch: Partial<AgentDefinition>) => {
    const next = { ...agent, ...patch };
    setAgents((list) => list.map((a) => (a.id === next.id ? next : a)));
    void storage?.saveAgent(next);
  };

  const setLayer = (
    id: PromptLayerId,
    patch: { enabled?: boolean; budget?: number },
  ) => {
    const prev = agent.layerOverrides?.[id] ?? {};
    updateAgent({
      layerOverrides: { ...agent.layerOverrides, [id]: { ...prev, ...patch } },
    });
  };

  const saveConfig = (next: LLMProviderConfig) => {
    setConfig(next);
    void storage?.saveConfig(next);
  };

  const letWorldPost = async () => {
    setRunning(true);
    for (const a of agents) {
      await plazaRef.current!.generatePost(a, agents);
    }
    setRunning(false);
  };

  const agentMemories = memories.filter((m) => m.agentId === agent.id);

  return (
    <div className="shell">
      <aside className="sessions">
        <div className="brand">
          <span className="brand-mark">
            <IconWind size={17} />
          </span>
          <span className="brand-name">Pneuma</span>
        </div>
        <div className="nav">
          <button
            className={view === "chat" ? "send" : "ghost"}
            onClick={() => setView("chat")}
          >
            <IconChat size={14} /> 会话
          </button>
          <button
            className={view === "plaza" ? "send" : "ghost"}
            onClick={() => setView("plaza")}
          >
            <IconUsers size={14} /> 广场
          </button>
        </div>
        {view === "chat" &&
          sessions.map((s) => (
            <div
              key={s.id}
              className={`session ${s.id === activeSessionId ? "active" : ""}`}
              onClick={() => setActiveSessionId(s.id)}
            >
              <div className="avatar">
                {s.participantIds.length > 1 ? "群" : s.title.slice(0, 1)}
              </div>
              <div>
                <div className="name">{s.title}</div>
                <div className="statusline">
                  {s.participantIds.length > 1
                    ? `${s.participantIds.length} 位角色`
                    : statusMap[s.participantIds[0]] || "在线"}
                </div>
              </div>
            </div>
          ))}
        <button className="send" onClick={() => setPresetModal(true)}>
          <IconSpark size={15} /> 按预设创建
        </button>
        <button className="ghost" onClick={() => setGroupModal(true)}>
          <IconPlus size={15} /> 新建群聊
        </button>
        <button className="ghost" onClick={() => packFileRef.current?.click()}>
          <IconUpload size={15} /> 导入人格包
        </button>
        <input
          ref={packFileRef}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPackImport(f);
            e.target.value = "";
          }}
        />
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          <IconUpload size={15} /> 导入角色卡
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.png"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        <button className="ghost" onClick={() => setSettings(true)}>
          <IconGear size={15} /> 设置
        </button>
        <div className="hint">v{__APP_VERSION__} · 数据保存在本机</div>
      </aside>

      {view === "chat" ? (
        <main className="chat">
          <header className="chat-head">
            <div>
              <span className="name">{session.title}</span>
              <span className="statusline">
                {isGroup ? "群聊 · 调度器决定谁发言" : statusMap[agent.id] ?? ""}
              </span>
            </div>
            <div className="head-actions">
              <span className="tokens">ctx {totalTokens} tok</span>
              <button className="ghost" onClick={() => setDrawer((d) => !d)}>
                <IconSliders size={14} /> 导演模式
              </button>
            </div>
          </header>

          <div className="messages">
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.role} ${m.kind ?? ""}`}>
                {isGroup && m.role === "assistant" && (
                  <div className="speaker">{nameOf(m.agentId)}</div>
                )}
                {m.kind === "sticker" ? "🐷 " : ""}
                {m.content}
              </div>
            ))}
            {pending && <div className="bubble assistant pending">{pending}</div>}
            {silence && <div className="notice">本轮沉默：{silence}</div>}
            <div ref={bottomRef} />
          </div>

          <footer className="composer">
            <input
              value={input}
              placeholder={
                isGroup
                  ? "对群里说点什么…（点名谁，谁发言）"
                  : "说点什么…（试试：记住我喜欢喝美式）"
              }
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            {running ? (
              <button
                className="ghost"
                onClick={() => runtimeRef.current!.abort(session.id)}
              >
                <IconStop size={14} /> 停止
              </button>
            ) : (
              <button className="send" onClick={send}>
                <IconSend size={14} /> 发送
              </button>
            )}
          </footer>
        </main>
      ) : (
        <main className="chat">
          <header className="chat-head">
            <div>
              <span className="name">广场</span>
              <span className="statusline">角色们的朋友圈</span>
            </div>
            <button className="send" disabled={running} onClick={letWorldPost}>
              <IconSpark size={14} /> 让世界发动态
            </button>
          </header>
          <div className="messages">
            {moments.map((m) => (
              <div key={m.id} className="moment">
                <div className="moment-head">
                  <div className="avatar small">{nameOf(m.authorId).slice(0, 1)}</div>
                  <span className="name">{nameOf(m.authorId)}</span>
                  <span className="statusline">
                    {new Date(m.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="moment-text">{m.text}</div>
                <div className="moment-actions">
                  <button
                    className="ghost tiny"
                    onClick={() => void plazaRef.current!.like(m.id, "user")}
                  >
                    <IconHeart size={13} /> {m.likes.includes("user") ? "已赞" : "赞"} {m.likes.length || ""}
                  </button>
                </div>
                {m.comments.map((c) => (
                  <div key={c.id} className="comment">
                    <span className="name">{nameOf(c.authorId)}</span>：{c.text}
                  </div>
                ))}
                <div className="comment-row">
                  <input
                    value={commentDrafts[m.id] ?? ""}
                    placeholder="评论…"
                    onChange={(e) =>
                      setCommentDrafts((d) => ({ ...d, [m.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const text = (commentDrafts[m.id] ?? "").trim();
                        if (text) {
                          void plazaRef.current!.addComment(m.id, "user", text);
                          setCommentDrafts((d) => ({ ...d, [m.id]: "" }));
                        }
                      }
                    }}
                  />
                </div>
              </div>
            ))}
            {!moments.length && (
              <div className="notice">还没有动态，点右上角让世界发一条。</div>
            )}
          </div>
        </main>
      )}

      {drawer && view === "chat" && (
        <aside className="drawer">
          <h3>导演模式 · {agent.name}</h3>
          <div className="meta">
            记忆 {agentMemories.length} 条 · 总 {totalTokens} tok
          </div>

          <h3>人格层（不裁剪）</h3>
          <textarea
            className="edit"
            rows={5}
            value={agent.persona}
            onChange={(e) => updateAgent({ persona: e.target.value })}
          />

          <h3>工具链</h3>
          {BUILTIN_TOOLS.map((t) => (
            <label key={t.name} className="check">
              <input
                type="checkbox"
                checked={agent.tools.includes(t.name)}
                onChange={(e) =>
                  updateAgent({
                    tools: e.target.checked
                      ? [...agent.tools, t.name]
                      : agent.tools.filter((n) => n !== t.name),
                  })
                }
              />
              {t.name} · {t.description}
            </label>
          ))}

          <h3>提示词层预算</h3>
          {layers.map((l) => (
            <section key={l.id} className="layer">
              <div className="layer-head">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={l.enabled}
                    onChange={(e) => setLayer(l.id, { enabled: e.target.checked })}
                  />
                  {l.id}
                </label>
                <input
                  className="budget"
                  type="number"
                  value={l.budget}
                  onChange={(e) =>
                    setLayer(l.id, { budget: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <pre>{l.content || "（空）"}</pre>
            </section>
          ))}

          <button className="ghost" onClick={exportPack}>
            <IconDownload size={14} /> 导出人格包
          </button>

          <h3>记忆库</h3>
          {agentMemories.map((m) => (
            <div key={m.id} className="mem">
              {m.pinned ? "📌 " : ""}
              {m.text}
            </div>
          ))}
          {!agentMemories.length && <div className="meta">（还没有记忆）</div>}
        </aside>
      )}

      {groupModal && (
        <div className="modal" onClick={() => setGroupModal(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h3>新建群聊（至少选两位）</h3>
            {agents.map((a) => (
              <label key={a.id} className="check">
                <input
                  type="checkbox"
                  checked={groupPick.includes(a.id)}
                  onChange={(e) =>
                    setGroupPick((p) =>
                      e.target.checked
                        ? [...p, a.id]
                        : p.filter((id) => id !== a.id),
                    )
                  }
                />
                {a.name}
              </label>
            ))}
            <button
              className="send"
              disabled={groupPick.length < 2}
              onClick={createGroup}
            >
              创建
            </button>
          </div>
        </div>
      )}

      {presetModal && (
        <div className="modal" onClick={() => setPresetModal(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h3>按预设创建（五类受众各取最优解）</h3>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="preset"
                onClick={() => createFromPreset(p.id)}
              >
                <span className="name">{p.label}</span>
                <span className="statusline">{p.audience}</span>
                <span className="preset-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {settings && (
        <SettingsCenter
          storage={storage}
          config={config}
          onConfig={saveConfig}
          ai={ai}
          onAI={(next) => {
            setAI(next);
            void storage?.setKV("aiConfig", next);
          }}
          theme={theme}
          onTheme={(t) => {
            setTheme(t);
            void storage?.setKV("theme", t);
          }}
          reduceMotion={reduceMotion}
          onReduceMotion={(v) => {
            setReduceMotion(v);
            void storage?.setKV("reduceMotion", v);
          }}
          updateState={updateState}
          onUpdateState={(s) => {
            setUpdateState(s);
            void storage?.setKV("updateState", s);
          }}
          autoCheck={autoCheck}
          onAutoCheck={(v) => {
            setAutoCheck(v);
            void storage?.setKV("autoCheck", v);
          }}
          onReplayOnboarding={() => {
            setSettings(false);
            setShowOnboarding(true);
          }}
          onImported={() => undefined}
          onClose={() => setSettings(false)}
          notify={(t) => toast(t)}
        />
      )}

      {showOnboarding && (
        <Onboarding
          communityUrl={__COMMUNITY_URL__}
          author={__AUTHOR__}
          onDone={() => {
            setShowOnboarding(false);
            void storage?.setKV("onboardingSeen", true);
          }}
        />
      )}

      {changelog && (
        <ChangelogModal
          version={changelog.version}
          notes={changelog.notes}
          url={changelog.url}
          onClose={() => {
            setChangelog(null);
            void storage?.setKV("lastSeenVersion", changelog.version);
          }}
        />
      )}
      <Toasts />
    </div>
  );
}