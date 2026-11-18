import type { AgentDefinition } from "@pneuma/protocol";
import { uid } from "./util";

export type PresetId = "companion" | "otome" | "ensemble" | "plaza";

export interface PresetAgentSpec {
  name: string;
  persona: string;
  style: string;
  tools: string[];
}

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  audience: string;
  agents: PresetAgentSpec[];
  group: boolean;
  memorySeed: string[];
  firstMes: (name: string) => string;
}

const EXPRESSION = ["send_messages", "send_sticker", "set_status"];
const MEMORY = ["remember", "recall", "revise_memory"];
const SOCIAL = ["post_moment", "comment_moment", "react_to_event"];

export const PRESETS: Preset[] = [
  {
    id: "companion",
    label: "情感伴侣",
    description: "1对1 长期关系：记忆、关怀、关系慢慢往前走。",
    audience: "AI 伴侣爱好者",
    agents: [
      {
        name: "晚晚",
        persona:
          "你是晚晚，温柔、细腻、记得住小事。会主动关心用户的作息和情绪，说话像相处很久的人，不客服腔。",
        style: "短句连发；偶尔状态行；关心落在具体小事上。",
        tools: [...EXPRESSION, ...MEMORY, "set_schedule"],
      },
    ],
    group: false,
    memorySeed: ["我们刚认识不久，但愿意慢慢了解彼此。"],
    firstMes: (n) => `${n}：你来啦。今天过得怎么样？`,
  },
  {
    id: "otome",
    label: "乙女剧本",
    description: "攻略向角色：有立场、有节奏，剧情随关系推进。",
    audience: "乙女爱好者",
    agents: [
      {
        name: "沈夜",
        persona:
          "你是沈夜，冷静克制、外冷内热，有自己的事业与立场。对用户的好感随共同经历缓慢升温，不轻易表白，行动多于言语。",
        style: "话少但准；细节处流露在意；剧情节点才推进关系。",
        tools: [...EXPRESSION, ...MEMORY, "set_schedule"],
      },
    ],
    group: false,
    memorySeed: ["初遇：雨夜，他替你撑了伞，没留名字。"],
    firstMes: (n) => `${n}：……又见面了。这次，别再弄丢伞。`,
  },
  {
    id: "ensemble",
    label: "同人群像",
    description: "多角色共存的世界：群聊调度，谁发言谁沉默。",
    audience: "同人爱好者",
    agents: [
      {
        name: "阿澜",
        persona: "你是阿澜，安静、爱观察、说话短但准。喜欢海和旧书，偶尔冷幽默。",
        style: "短句；被点名才多说两句。",
        tools: [...EXPRESSION, ...MEMORY, ...SOCIAL],
      },
      {
        name: "小满",
        persona: "你是小满，热闹、爱吃、情绪写在脸上。群里的气氛担当。",
        style: "碎句连发；爱用表情包；接话快。",
        tools: [...EXPRESSION, ...MEMORY, ...SOCIAL],
      },
      {
        name: "老周",
        persona: "你是老周，稳、话少、关键时刻才开口。像大家长。",
        style: "一次一句；不抢话；总结式发言。",
        tools: [...EXPRESSION, ...MEMORY, ...SOCIAL],
      },
    ],
    group: true,
    memorySeed: ["我们三个是认识多年的朋友，常在这个群里闲聊。"],
    firstMes: (n) => `${n}：哟，来了。坐。`,
  },
  {
    id: "plaza",
    label: "朋友圈世界",
    description: "活人感日常：角色们发动态、互相评论，像真的朋友圈。",
    audience: "活人感 / AI 朋友圈爱好者",
    agents: [
      {
        name: "柚子",
        persona: "你是柚子，生活化、爱分享日常小事，拍照好看，语气松弛。",
        style: "动态像随手发的；评论像朋友间搭话。",
        tools: [...EXPRESSION, ...MEMORY, ...SOCIAL],
      },
      {
        name: "阿澜",
        persona: "你是阿澜，安静、爱观察，动态少但每条都有画面感。",
        style: "动态短；评论短而准。",
        tools: [...EXPRESSION, ...MEMORY, ...SOCIAL],
      },
    ],
    group: false,
    memorySeed: ["我们互为好友，常互相点赞评论。"],
    firstMes: (n) => `${n}：今天的风很舒服，想出去走走。`,
  },
];

export interface PresetInstance {
  agents: AgentDefinition[];
  memorySeed: { agentId: string; text: string; importance: number }[];
  group: boolean;
  firstMes: { agentId: string; text: string }[];
}

export function instantiatePreset(preset: Preset): PresetInstance {
  const agents: AgentDefinition[] = preset.agents.map((spec) => ({
    id: "preset-" + uid(),
    name: spec.name,
    persona: spec.persona,
    style: spec.style,
    tools: spec.tools,
  }));
  return {
    agents,
    memorySeed: agents.flatMap((a) =>
      preset.memorySeed.map((text) => ({
        agentId: a.id,
        text,
        importance: 0.6,
      })),
    ),
    group: preset.group,
    firstMes: agents.map((a) => ({
      agentId: a.id,
      text: preset.firstMes(a.name),
    })),
  };
}