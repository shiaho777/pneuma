import type {
  AgentDefinition,
  LLMMessage,
  LLMProviderConfig,
  Moment,
  MomentComment,
  RuntimeEvent,
} from "@pneuma/protocol";
import type { EventBus } from "./event-bus";
import { createProvider, type LLMProvider } from "./llm-adapter";
import type { PneumaStorage } from "./storage";
import { uid } from "./util";

export interface PlazaDeps {
  bus: EventBus;
  emit: (event: RuntimeEvent) => void;
  storage?: PneumaStorage;
  provider?: LLMProvider;
  config?: LLMProviderConfig;
  commentChance?: number;
}

export class PlazaEngine {
  private moments: Moment[] = [];

  constructor(private deps: PlazaDeps) {}

  restore(moments: Moment[]): void {
    this.moments = [...moments];
  }

  all(): Moment[] {
    return [...this.moments].sort((a, b) => b.createdAt - a.createdAt);
  }

  async generatePost(
    agent: AgentDefinition,
    participants: AgentDefinition[],
  ): Promise<Moment | null> {
    const provider = this.deps.provider ?? createProvider(this.deps.config);
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `## persona\n${agent.persona}\n## plaza\n你现在要发一条朋友圈动态，用 post_moment 工具，内容像你本人会说的话，短、生活化。`,
      },
      { role: "user", content: "发一条朋友圈" },
    ];
    let posted: Moment | null = null;
    for await (const delta of provider.stream(messages, [])) {
      if (delta.type === "tool" && delta.name === "post_moment") {
        posted = await this.post(agent, String(delta.args.text ?? ""), participants);
      }
    }
    return posted;
  }

  async post(
    author: AgentDefinition,
    text: string,
    participants: AgentDefinition[],
  ): Promise<Moment> {
    const moment: Moment = {
      id: uid(),
      authorId: author.id,
      text,
      createdAt: Date.now(),
      likes: [],
      comments: [],
    };
    this.moments.push(moment);
    this.deps.emit({ type: "moment.posted", moment });
    void this.deps.storage?.saveMoment(moment);
    this.deps.bus.publish({
      type: "moment.posted",
      actorId: author.id,
      text,
      momentId: moment.id,
    });

    const subscribers = this.deps.bus
      .subscribersOf(author.id)
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is AgentDefinition => Boolean(p));
    const commenters = subscribers.slice(0, 2);
    for (const commenter of commenters) {
      if (Math.random() > (this.deps.commentChance ?? 0.7)) continue;
      await this.agentComment(moment, commenter);
    }
    return moment;
  }

  private async agentComment(
    moment: Moment,
    commenter: AgentDefinition,
  ): Promise<void> {
    const provider = this.deps.provider ?? createProvider(this.deps.config);
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `## persona\n${commenter.persona}\n## plaza\n你看到朋友的一条动态，用一句短评论回应，像活人，不客服腔。`,
      },
      { role: "user", content: `动态内容：${moment.text}\n写一条你的评论。` },
    ];
    let buffer = "";
    for await (const delta of provider.stream(messages, [])) {
      if (delta.type === "text") buffer += delta.text;
    }
    const text = buffer.split("\n").map((s) => s.trim()).filter(Boolean)[0];
    if (!text) return;
    await this.addComment(moment.id, commenter.id, text);
  }

  async addComment(
    momentId: string,
    authorId: string,
    text: string,
  ): Promise<MomentComment | null> {
    const moment = this.moments.find((m) => m.id === momentId);
    if (!moment) return null;
    const comment: MomentComment = {
      id: uid(),
      authorId,
      text,
      createdAt: Date.now(),
    };
    moment.comments.push(comment);
    this.deps.emit({ type: "moment.commented", momentId, comment });
    void this.deps.storage?.saveMoment(moment);
    this.deps.bus.publish({
      type: "moment.commented",
      actorId: authorId,
      text,
      momentId,
    });
    return comment;
  }

  async like(momentId: string, userId: string): Promise<void> {
    const moment = this.moments.find((m) => m.id === momentId);
    if (!moment) return;
    if (moment.likes.includes(userId)) {
      moment.likes = moment.likes.filter((l) => l !== userId);
    } else {
      moment.likes.push(userId);
    }
    this.deps.emit({ type: "moment.posted", moment });
    void this.deps.storage?.saveMoment(moment);
  }
}