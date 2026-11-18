import { useState } from "react";
import type { AIConfig, LLMProviderConfig } from "@pneuma/protocol";
import {
  checkForUpdate,
  type PneumaBackup,
  type PneumaStorage,
  type UpdateState,
} from "@pneuma/core";
import { ProvidersTab } from "./ProvidersTab";
import { IconDownload, IconUpload, IconWind } from "./icons";
import licenseText from "../../../LICENSE?raw";
import thirdParty from "../../../apps/web/src/assets/THIRD-PARTY-LICENSES.txt?raw";
import readmeUrl from "../../../README.md";

export type Theme = "light" | "dark";

export interface SettingsCenterProps {
  storage?: PneumaStorage;
  config: LLMProviderConfig;
  onConfig: (next: LLMProviderConfig) => void;
  ai: AIConfig;
  onAI: (next: AIConfig) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  reduceMotion: boolean;
  onReduceMotion: (v: boolean) => void;
  updateState: UpdateState;
  onUpdateState: (s: UpdateState) => void;
  autoCheck: boolean;
  onAutoCheck: (v: boolean) => void;
  onReplayOnboarding: () => void;
  onImported: () => void;
  onClose: () => void;
  notify: (text: string) => void;
}

const TABS = ["模型接口", "关于", "社区与支持", "更新", "隐私与外观"] as const;

export function SettingsCenter(props: SettingsCenterProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("模型接口");
  const [showLicense, setShowLicense] = useState(false);
  const [showThirdParty, setShowThirdParty] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const repo = __REPO__;
  const author = __AUTHOR__;
  const community = __COMMUNITY_URL__;

  const doCheck = async (force: boolean) => {
    setChecking(true);
    const result = await checkForUpdate(
      repo || undefined,
      __APP_VERSION__,
      props.updateState,
      force,
    );
    props.onUpdateState(result.state);
    setUpdateMsg(
      result.status === "unconfigured"
        ? "仓库槽位未配置：发布时设置 PNEUMA_REPO 环境变量后启用更新检查。"
        : result.status === "available"
          ? `发现新版本 ${result.latest}`
          : result.status === "current"
            ? `已是最新（${__APP_VERSION__}）`
            : `检查失败：${result.error}`,
    );
    setChecking(false);
  };

  const exportBackup = async () => {
    if (!props.storage) return;
    const backup = await props.storage.exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pneuma-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    props.notify("已导出整库备份");
  };

  const importBackup = async (file: File) => {
    if (!props.storage) return;
    try {
      const backup = JSON.parse(await file.text()) as PneumaBackup;
      await props.storage.importAll(backup);
      props.notify("备份已恢复，正在重载");
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      props.notify("备份导入失败：" + String(err));
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      props.notify("已复制");
    } catch {
      props.notify("复制失败，请手动选择");
    }
  };

  return (
    <div className="modal" onClick={props.onClose}>
      <div className="panel wide" onClick={(e) => e.stopPropagation()}>
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={tab === t ? "send tiny" : "ghost tiny"}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "模型接口" && (
          <ProvidersTab ai={props.ai} onChange={props.onAI} notify={props.notify} />
        )}

        {tab === "关于" && (
          <section className="settings-section">
            <div className="identity">
              <div className="avatar">
                <IconWind size={20} />
              </div>
              <div>
                <div className="name">Pneuma</div>
                <button
                  className="ghost tiny"
                  onClick={() => copy(__APP_VERSION__)}
                >
                  v{__APP_VERSION__} · 点击复制
                </button>
                <div className="statusline">
                  感情优先的 AI 角色世界 · 本地优先 · 零遥测
                </div>
              </div>
            </div>
            <div className="row">
              <a href={readmeUrl} target="_blank" rel="noreferrer">
                README（新标签打开）
              </a>
              <button className="ghost tiny" onClick={() => setShowLicense(true)}>
                开源协议 MIT
              </button>
              <button
                className="ghost tiny"
                onClick={() => setShowThirdParty(true)}
              >
                第三方许可清单
              </button>
            </div>
            <div className="meta">
              作者：{author || "槽位待维护者配置（PNEUMA_AUTHOR）"}
              {author && (
                <button className="ghost tiny" onClick={() => copy(author)}>
                  复制
                </button>
              )}
            </div>
            {showLicense && <pre className="license">{licenseText}</pre>}
            {showThirdParty && <pre className="license">{thirdParty}</pre>}
          </section>
        )}

        {tab === "社区与支持" && (
          <section className="settings-section">
            <div className="row">
              {community ? (
                <a href={community} target="_blank" rel="noreferrer">
                  社区入口
                </a>
              ) : (
                <span className="meta">社区入口：待配置（PNEUMA_COMMUNITY_URL）</span>
              )}
              {repo ? (
                <>
                  <a
                    href={`https://github.com/${repo}/issues/new/choose`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    意见反馈（issue 模板）
                  </a>
                  <a
                    href={`https://github.com/${repo}/issues`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    已有 issues
                  </a>
                  <a
                    href={`https://github.com/${repo}/blob/main/CONTRIBUTING.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    参与贡献
                  </a>
                  <a
                    href={`https://github.com/${repo}/graphs/contributors`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    感谢贡献者
                  </a>
                </>
              ) : (
                <span className="meta">
                  反馈/贡献/贡献者入口：仓库创建后自动启用
                </span>
              )}
            </div>
            <p className="meta">
              不会代码也能贡献：文档、翻译、设计、报 bug、分享人格包，同样上榜。
            </p>
          </section>
        )}

        {tab === "更新" && (
          <section className="settings-section">
            <label className="check">
              <input
                type="checkbox"
                checked={props.autoCheck}
                onChange={(e) => props.onAutoCheck(e.target.checked)}
              />
              自动检查更新（默认开，可关）
            </label>
            <div className="row">
              <button
                className="send tiny"
                disabled={checking}
                onClick={() => doCheck(true)}
              >
                立即检查
              </button>
              {props.updateState.latest && (
                <button
                  className="ghost tiny"
                  onClick={() => {
                    props.onUpdateState({
                      ...props.updateState,
                      skipped: props.updateState.latest,
                    });
                    setUpdateMsg(`已跳过 ${props.updateState.latest}`);
                  }}
                >
                  跳过此版本
                </button>
              )}
              {props.updateState.url && (
                <a href={props.updateState.url} target="_blank" rel="noreferrer">
                  完整 release
                </a>
              )}
            </div>
            <div className="meta">{updateMsg || "尚未检查"}</div>
            {props.updateState.notes && (
              <pre className="license">{props.updateState.notes}</pre>
            )}
          </section>
        )}

        {tab === "隐私与外观" && (
          <section className="settings-section">
            <p className="meta">
              收集为零。数据全在本机 IndexedDB。网络请求仅两类：你自配的模型接口、你触发的
              GitHub 更新检查（ETag 缓存）。无遥测、无广告、无强制登录。
            </p>
            <div className="row">
              <button className="ghost tiny" onClick={exportBackup}>
                <IconDownload size={13} /> 导出整库备份
              </button>
              <label className="ghost tiny file-label">
                <IconUpload size={13} /> 导入备份
                <input
                  type="file"
                  accept=".json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importBackup(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <label className="field">
              主题
              <select
                value={props.theme}
                onChange={(e) => props.onTheme(e.target.value as Theme)}
              >
                <option value="light">暖纸白</option>
                <option value="dark">夜黑</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={props.reduceMotion}
                onChange={(e) => props.onReduceMotion(e.target.checked)}
              />
              减弱动效
            </label>
            <button className="ghost tiny" onClick={props.onReplayOnboarding}>
              回看引导
            </button>
          </section>
        )}

        <button className="send" onClick={props.onClose}>
          完成
        </button>
      </div>
    </div>
  );
}