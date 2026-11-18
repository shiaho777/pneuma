import { useState } from "react";
import { IconWind } from "./icons";

const SLIDES = [
  {
    title: "Pneuma · 感情优先的 AI 角色世界",
    body: "角色不是住在假手机里的人，而是有记忆、会主动、表达自然的 agent。\n酒馆的深度，消费级的体验。",
  },
  {
    title: "三件事，零配置",
    body: "① 聊天：拆句连发、状态行、表情包，像活人。\n② 记忆：她记得你说过的每件小事。\n③ 广场与群像：角色们发动态、互相评论，谁发言谁沉默由调度器决定。",
  },
  {
    title: "初次使用，希望你玩得开心",
    body: "数据全在本机，零遥测、零强制登录。\n极客深度都收在「导演模式」抽屉里，普通人永远不用碰。",
  },
];

export function Onboarding({
  onDone,
  communityUrl,
  author,
}: {
  onDone: () => void;
  communityUrl: string;
  author: string;
}) {
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  return (
    <div className="modal">
      <div className="panel onboarding">
        <div className="onboarding-hero">
          <IconWind size={28} />
        </div>
        <h3>{slide.title}</h3>
        <p className="onboarding-body">{slide.body}</p>
        {i === SLIDES.length - 1 && (
          <div className="meta">
            {communityUrl ? (
              <a href={communityUrl} target="_blank" rel="noreferrer">
                社区入口
              </a>
            ) : (
              "社区入口：待维护者配置"
            )}
            {" · "}
            {author ? `作者：${author}` : "作者槽位：待维护者配置"}
          </div>
        )}
        <div className="onboarding-dots">
          {SLIDES.map((_, k) => (
            <i key={k} className={k === i ? "on" : ""} />
          ))}
        </div>
        <div className="onboarding-actions">
          <button className="ghost" onClick={onDone}>
            跳过
          </button>
          {i < SLIDES.length - 1 ? (
            <button className="send" onClick={() => setI(i + 1)}>
              下一步
            </button>
          ) : (
            <button className="send" onClick={onDone}>
              开始
            </button>
          )}
        </div>
      </div>
    </div>
  );
}