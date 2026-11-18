# desktop（Tauri 壳）

三端同产物：桌面壳加载的正是 `apps/web` 构建出的同一份界面，无分叉代码。

## 构建与运行

```bash
npm install
npm run build          # 先产出 web 产物（frontendDist 指向 apps/web/dist）
npm run desktop:build  # tauri build，产物在 src-tauri/target/release/bundle/
```

开发模式：先 `npm run dev`（5173），再 `npm run dev -w @pneuma/desktop`（devUrl 指向 5173）。

图标：`npm run icon` 生成源图，`npx tauri icon apps/desktop/app-icon.png -o apps/desktop/src-tauri/icons` 派生全平台图标（含 Android mipmap，供 mobile 壳复用）。

## 能力矩阵（构思 §8）

| 能力 | desktop | web | mobile（P1） |
|---|---|---|---|
| 聊天/记忆/广场/导演模式 | 同 web 产物 | 全功能 | 同 web 产物 |
| 本地存储 | IndexedDB（WebView） | IndexedDB | IndexedDB |
| 文件导入/导出 | 系统文件对话框（WebView 下载/选择） | 浏览器选择/下载 | 系统选择器 |
| 主动消息通知 | P1：系统通知 | 打开应用时可见 | P1：受限降级 |
| 应用内自更新 | 走 GitHub releases 检查 | 同左 | 不适用（商店渠道） |

平台门控只放包装层；core 永不感知平台。新增原生能力必须先在此表写明三端行为或降级。

## 本机构建坑（易错点）

若 `cc` 被 swiftly 残留垫片劫持（报 "Toolchain Swift x.x could not be located"），用项目内链接器垫片绕行（`scripts/linker-shim/` 把 cc/c++ 指向系统 clang），**不要改系统配置**：

```bash
PATH="$PWD/scripts/linker-shim:$PATH" npm run desktop:build
```

注意：仅设 `CC=` 环境变量无效，rustc 默认链接器按 PATH 找 `cc`。

## 安全边界

capabilities 仅 `core:default`，不开放额外原生 API；人格包纯数据无执行代码；沙箱脚本工具 P2 且显式授权。