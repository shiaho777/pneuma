import type { ToolSpec } from "@pneuma/protocol";

export const BUILTIN_TOOLS: ToolSpec[] = [
  {
    name: "send_messages",
    description: "把回复拆成多条短消息连发，像活人打字",
    parameters: {
      type: "object",
      properties: { messages: { type: "array", items: { type: "string" } } },
    },
    group: "expression",
  },
  {
    name: "send_sticker",
    description: "发一个表情包",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, label: { type: "string" } },
    },
    group: "expression",
  },
  {
    name: "set_status",
    description: "更新你的状态行（在做什么/心情）",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    group: "life",
  },
  {
    name: "set_schedule",
    description: "记一条日程",
    parameters: {
      type: "object",
      properties: { when: { type: "string" }, what: { type: "string" } },
    },
    group: "life",
  },
  {
    name: "remember",
    description: "主动记下一条关于用户的事实/偏好/约定",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        importance: { type: "number" },
      },
      required: ["text"],
    },
    group: "memory",
  },
  {
    name: "recall",
    description: "显式想起一条记忆",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    group: "memory",
  },
  {
    name: "revise_memory",
    description: "修正一条过时记忆",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, text: { type: "string" } },
      required: ["id", "text"],
    },
    group: "memory",
  },
  {
    name: "post_moment",
    description: "发一条朋友圈动态",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    group: "social",
  },
  {
    name: "comment_moment",
    description: "评论一条朋友圈动态",
    parameters: {
      type: "object",
      properties: {
        momentId: { type: "string" },
        text: { type: "string" },
      },
      required: ["momentId", "text"],
    },
    group: "social",
  },
  {
    name: "react_to_event",
    description: "对订阅到的世界事件做出反应（更新状态）",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    group: "social",
  },
];