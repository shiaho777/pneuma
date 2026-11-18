import type {
  AgentDefinition,
  ChatMessage,
  LLMMessage,
  LLMProviderConfig,
  RuntimeEvent,
  Session,
  ToolCall,
} from "@pneuma/protocol";
import type { EventBus } from "./event-bus";
import type { InnerVoiceStore } from "./inner-voice";
import { createProvider, type LLMProvider } from "./llm-adapter";
import { loreFor, scanLore } from "./lore";
import type { MemoryStore } from "./memory";
import type { MemoryExtractor } from "./memory-extractor";
import type { PlazaEngine } from "./plaza-engine";
import { assemblePrompt } from "./prompt-assembler";
import { scheduleSpeakers } from "./scheduler";
import { BUILTIN_TOOLS } from "./tools";
import { uid } from "./util";

export interface RuntimeDeps {
  memory: MemoryStore;
  emit: (event: RuntimeEvent) => void;
  provider?: LLMProvider;
  bus?: EventBus;
  plaza?: PlazaEngine;
  spec?: { context: number; output: number };
  extractor?: MemoryExtractor;
  inner?: InnerVoiceStore;
}

export class AgentRuntime {
  private history = new Map<string, LLMMessage[]>();
  private status = new Map<string, string>();
  private controllers = new Map<string, AbortController>();

  constructor(public deps: RuntimeDeps) {}

  abort(sessionId: string): void {
    this.controllers.get(sessionId)?.abort();
  }

  restoreHistory(sessionId: string, messages: ChatMessage[]): void {
    this.history.set(
      sessionId,
      messages.map((m) => ({ role: m.role, content: m.content })),
    );
  }

  statusOf(agentId: string): string | undefined {
    return this.status.get(agentId);
  }

  async send(
    session: Session,
    agent: AgentDefinition,
    userText: string,
    config?: LLMProviderConfig,
  ): Promise<void> {
    await this.runTurn(session, [agent], userText, config);
  }

  async sendGroup(
    session: Session,
    agents: AgentDefinition[],
    userText: string,
    config?: LLMProviderConfig,
  ): Promise<void> {
    await this.runTurn(session, agents, userText, config);
  }

  private async runTurn(
    session: Session,
    agents: AgentDefinition[],
    userText: string,
    config?: LLMProviderConfig,
  ): Promise<void> {
    const history = this.history.get(session.id) ?? [];
    const userMessage: ChatMessage = {
      id: uid(),
      sessionId: session.id,
      role: "user",
      content: userText,
      createdAt: Date.now(),
    };
    history.push({ role: "user", content: userText });
    this.history.set(session.id, history);
    this.deps.emit({
      type: "message.completed",
      sessionId: session.id,
      message: userMessage,
    });
    this.deps.bus?.publish({
      type: "session.message",
      actorId: "user",
      text: userText,
    });

    const statusMap: Record<string, string> = {};
    for (const a of agents) {
      const s = this.status.get(a.id);
      if (s) statusMap[a.id] = s;
    }
    const decisions =
      agents.length > 1
        ? scheduleSpeakers(agents, userText, statusMap, { maxSpeakers: 2 })
        : agents.map((a) => ({
            agentId: a.id,
            speak: true,
            reason: "单聊",
          }));

    const controller = new AbortController();
    this.controllers.set(session.id, controller);
    const provider = this.deps.provider ?? createProvider(config);

    try {
      for (const decision of decisions) {
        const agent = agents.find((a) => a.id === decision.agentId);
        if (!agent) continue;
        if (!decision.speak) {
          this.deps.emit({
            type: "group.silent",
            sessionId: session.id,
            agentId: agent.id,
            reason: decision.reason,
          });
          continue;
        }
        await this.speak(
          session,
          agent,
          agents,
          history,
          provider,
          controller,
          decision.reason,
        );
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        this.deps.emit({
          type: "run.failed",
          sessionId: session.id,
          error: String(err),
        });
      }
    } finally {
      this.controllers.delete(session.id);
    }
  }

  private async speak(
    session: Session,
    agent: AgentDefinition,
    agents: AgentDefinition[],
    history: LLMMessage[],
    provider: LLMProvider,
    controller: AbortController,
    reason: string,
  ): Promise<void> {
    const query = history[history.length - 1]?.content ?? "";
    const retrieved = this.deps.memory.retrieve(query, 24, Date.now(), agent.id);
    const worldEvents = this.deps.bus
      ?.relevantFor(agent.id)
      .map((e) => `${e.actorId === "user" ? "用户" : e.actorId}：${e.text}`);
    const loreHits = agent.lore?.length
      ? scanLore(agent.lore, history, {
          sessionId: session.id,
          turn: history.length,
        })
      : [];
    const prompt = assemblePrompt({
      agent,
      memories: retrieved,
      history,
      lore: {
        persona: loreFor(loreHits, "persona"),
        memory: loreFor(loreHits, "memory"),
        scene: loreFor(loreHits, "scene"),
      },
      scene: {
        now: new Date().toLocaleString("zh-CN"),
        status: this.status.get(agent.id),
        inner: this.deps.inner?.render(agent.id),
        events: [
          ...(worldEvents ?? []),
          agents.length > 1
            ? `群聊「${session.title}」，其他成员：${agents
                .filter((a) => a.id !== agent.id)
                .map((a) => a.name)
                .join("、")}。本轮你发言的理由：${reason}。`
            : "",
        ].filter(Boolean),
      },
      spec: this.deps.spec,
    });
    this.deps.emit({
      type: "prompt.assembled",
      sessionId: session.id,
      layers: prompt.layers,
      totalTokens: prompt.totalTokens,
    });

    const tools = BUILTIN_TOOLS.filter((t) => agent.tools.includes(t.name));
    let buffer = "";
    for await (const delta of provider.stream(
      prompt.messages,
      tools,
      controller.signal,
      { maxOutputTokens: this.deps.spec?.output || undefined },
    )) {
      if (delta.type === "text") {
        buffer += delta.text;
        this.deps.emit({
          type: "message.delta",
          sessionId: session.id,
          messageId: "pending",
          delta: delta.text,
        });
      } else {
        const call: ToolCall = { id: uid(), name: delta.name, args: delta.args };
        this.deps.emit({ type: "tool.called", sessionId: session.id, call });
        await this.executeTool(session, agent, agents, call);
      }
    }

    const parts = buffer
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      const message: ChatMessage = {
        id: uid(),
        sessionId: session.id,
        role: "assistant",
        agentId: agent.id,
        content: part,
        createdAt: Date.now(),
      };
      history.push({ role: "assistant", content: part });
      this.deps.emit({
        type: "message.completed",
        sessionId: session.id,
        message,
      });
      this.deps.bus?.publish({
        type: "session.message",
        actorId: agent.id,
        text: part,
      });
    }

    await this.extractMemories(session, agent, history);
  }

  private async extractMemories(
    session: Session,
    agent: AgentDefinition,
    history: LLMMessage[],
  ): Promise<void> {
    const extractor = this.deps.extractor;
    if (!extractor) return;
    const key = `${session.id}:${agent.id}`;
    if (!extractor.shouldRun(key, history.length)) return;
    const result = await extractor.run(key, agent.id, history);
    for (const item of result.accepted) {
      this.deps.emit({
        type: "memory.added",
        sessionId: session.id,
        agentId: agent.id,
        itemId: item.id,
        text: item.text,
      });
    }
    for (const item of result.reinforced) {
      this.deps.emit({
        type: "memory.reinforced",
        sessionId: session.id,
        agentId: agent.id,
        itemId: item.id,
        activations: item.activations ?? 1,
      });
    }
    for (const candidate of result.pending) {
      this.deps.emit({
        type: "memory.pending",
        sessionId: session.id,
        candidate,
      });
    }
  }

  private async executeTool(
    session: Session,
    agent: AgentDefinition,
    agents: AgentDefinition[],
    call: ToolCall,
  ): Promise<void> {
    let output = "ok";
    let ok = true;
    switch (call.name) {
      case "set_status": {
        const text = String(call.args.text ?? "");
        this.status.set(agent.id, text);
        this.deps.emit({
          type: "status.updated",
          sessionId: session.id,
          agentId: agent.id,
          text,
        });
        break;
      }
      case "remember": {
        const { item, created } = this.deps.memory.addOrReinforce(
          "semantic",
          String(call.args.text ?? ""),
          Number(call.args.importance ?? 0.6),
          agent.id,
          { source: "tool" },
        );
        this.deps.emit(
          created
            ? {
                type: "memory.added",
                sessionId: session.id,
                agentId: agent.id,
                itemId: item.id,
                text: item.text,
              }
            : {
                type: "memory.reinforced",
                sessionId: session.id,
                agentId: agent.id,
                itemId: item.id,
                activations: item.activations ?? 1,
              },
        );
        output = created ? "ok" : "reinforced";
        break;
      }
      case "set_inner": {
        if (this.deps.inner) {
          const inner = this.deps.inner.set(agent.id, {
            emotion: call.args.emotion ? String(call.args.emotion) : undefined,
            concern: call.args.concern ? String(call.args.concern) : undefined,
            pendingIntent: call.args.pendingIntent
              ? String(call.args.pendingIntent)
              : undefined,
          });
          this.deps.emit({
            type: "inner.updated",
            sessionId: session.id,
            agentId: agent.id,
            inner,
          });
        } else {
          ok = false;
          output = "inner store not available";
        }
        break;
      }
      case "recall": {
        const found = this.deps.memory
          .retrieve(String(call.args.query ?? ""), 6)
          .filter((m) => m.agentId === agent.id)
          .slice(0, 3);
        output = found.map((f) => f.text).join("；") || "（没有相关记忆）";
        break;
      }
      case "revise_memory": {
        ok = this.deps.memory.revise(
          String(call.args.id ?? ""),
          String(call.args.text ?? ""),
        );
        output = ok ? "ok" : "memory not found";
        break;
      }
      case "send_messages": {
        const list = Array.isArray(call.args.messages)
          ? (call.args.messages as unknown[])
          : [];
        for (const m of list) {
          const message: ChatMessage = {
            id: uid(),
            sessionId: session.id,
            role: "assistant",
            agentId: agent.id,
            content: String(m),
            createdAt: Date.now(),
          };
          this.deps.emit({
            type: "message.completed",
            sessionId: session.id,
            message,
          });
        }
        break;
      }
      case "send_sticker": {
        const message: ChatMessage = {
          id: uid(),
          sessionId: session.id,
          role: "assistant",
          agentId: agent.id,
          content: String(call.args.label ?? call.args.id ?? "表情包"),
          createdAt: Date.now(),
          kind: "sticker",
        };
        this.deps.emit({
          type: "message.completed",
          sessionId: session.id,
          message,
        });
        break;
      }
      case "post_moment": {
        if (this.deps.plaza) {
          await this.deps.plaza.post(
            agent,
            String(call.args.text ?? ""),
            agents,
          );
        } else {
          ok = false;
          output = "plaza not available";
        }
        break;
      }
      case "comment_moment": {
        if (this.deps.plaza) {
          const comment = await this.deps.plaza.addComment(
            String(call.args.momentId ?? ""),
            agent.id,
            String(call.args.text ?? ""),
          );
          ok = Boolean(comment);
          output = ok ? "ok" : "moment not found";
        } else {
          ok = false;
          output = "plaza not available";
        }
        break;
      }
      case "react_to_event": {
        const text = String(call.args.text ?? "");
        this.status.set(agent.id, text);
        this.deps.emit({
          type: "status.updated",
          sessionId: session.id,
          agentId: agent.id,
          text,
        });
        break;
      }
      default:
        ok = false;
        output = `unknown tool ${call.name}`;
    }
    this.deps.emit({
      type: "tool.result",
      sessionId: session.id,
      result: { callId: call.id, name: call.name, ok, output },
    });
  }
}