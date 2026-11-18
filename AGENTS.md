# AGENTS.md · Pneuma

本文件只写**本项目特有、agent 会反复搞错**的约定。通用编码礼仪不在此重复。

## 项目是什么

感情优先的 AI 角色世界。核心卖点 = 高度自定义 Agent 架构（工具链/提示词/上下文/Skill 管理），三关系形态共存，五类受众预设分流。设计基线见 `构思.md`（v0.2，用户已拍板）。

## 包边界（机器 gate，违反即 CI 红）

- `packages/core` **永不** import `@pneuma/ui` 或 react。
- `packages/protocol` 只放纯类型与事件契约，不 import core/ui/react。
- `packages/ui` 只经 `@pneuma/core` 出口与 `@pneuma/protocol` 使用能力，不摸 core 内部文件。
- 检查：`npm run gate`；基线 `scripts/boundary-baseline.json` **只缩不涨**，新增违规必须修代码而不是加基线。

## 运行时契约（易错点）

- 工具结果 = 结构化 `RuntimeEvent`，**双写**上下文与 UI；禁止"界面演一套、上下文记一套"。
- 提示词五层装配顺序固定：constitution → persona → relationship → memory → scene；每层硬预算，**persona 不裁剪**，memory 按分数淘汰。
- 记忆检索三维：新近 × 重要性 × 相关性；pinned 不淘汰。
- 弱模型降级：表达组工具不可用时退化为约定文本格式（拆句符/状态行前缀），解析器兜底。
- 群聊（M2）：发言调度器决定谁发言谁沉默；共享世界事件**订阅制**注入，禁止全量互塞上下文。
- 人格包（M3）：`pneuma-persona` formatVersion 1，纯数据无执行代码；导入必须 `parsePersonaPack` 校验且 `agentFromPack` 重生成 ID；预设是默认最优解，导演模式才暴露复杂度。

## 平台契约

- 本地优先：零后端、零遥测；数据全在本机（Dexie/IndexedDB）。
- 持久化边界：core 只定义 `PneumaStorage` 接口，Dexie 实现放 `apps/web/src/storage.ts`；core 永不 import dexie。记忆条目带 `agentId`，检索后必须按角色过滤。
- 三端同产物（web/desktop/mobile）；平台门控只放包装层，能力矩阵写明每端行为或降级。
- 桌面开发测试先行（用户环境为桌面）；mobile 壳 P1。

## 验证基线

- `npm run verify` = typecheck 零错误 + gate + test + build，交付前必跑。
- green CI ≠ 真机正确；原生能力真机验证。
- 评估驱动：感情四支柱（连续性/主动性/自然度/进展感）脚本场景见构思 §11，改动运行时须跑 `npm test`。

## 流程

- Issue → 分支 → PR → CI；Issue/PR 英文（沿用上游社区约定，待用户确认后可改）。
- 不主动 commit/push，除非用户要求。
- 人格包纯数据无执行代码；沙箱脚本工具 P2 且显式授权。