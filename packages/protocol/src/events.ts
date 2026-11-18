import type {
  ChatMessage,
  InnerState,
  MemoryCandidate,
  Moment,
  MomentComment,
  PromptLayer,
  ToolCall,
  ToolResult,
} from "./types";

export type RuntimeEvent =
  | { type: "message.delta"; sessionId: string; messageId: string; delta: string }
  | { type: "message.completed"; sessionId: string; message: ChatMessage }
  | { type: "status.updated"; sessionId: string; agentId: string; text: string }
  | { type: "tool.called"; sessionId: string; call: ToolCall }
  | { type: "tool.result"; sessionId: string; result: ToolResult }
  | {
      type: "memory.added";
      sessionId: string;
      agentId: string;
      itemId: string;
      text: string;
    }
  | {
      type: "prompt.assembled";
      sessionId: string;
      layers: PromptLayer[];
      totalTokens: number;
    }
  | { type: "run.failed"; sessionId: string; error: string }
  | { type: "group.silent"; sessionId: string; agentId: string; reason: string }
  | { type: "moment.posted"; moment: Moment }
  | {
      type: "moment.commented";
      momentId: string;
      comment: MomentComment;
    }
  | {
      type: "memory.reinforced";
      sessionId: string;
      agentId: string;
      itemId: string;
      activations: number;
    }
  | { type: "memory.pending"; sessionId: string; candidate: MemoryCandidate }
  | {
      type: "inner.updated";
      sessionId: string;
      agentId: string;
      inner: InnerState;
    };