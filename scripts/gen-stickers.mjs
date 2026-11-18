import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "packages", "ui", "src", "assets", "stickers");
mkdirSync(target, { recursive: true });

/** 内置表情包：自绘矢量小猪 + 文字条，风格参照玩家常用的猪猪表情包 */
const STICKERS = [
  { id: "fragile", label: "我好脆弱啊", caption: "我好脆弱啊，我真的特别想哭", bg: "#e8f4ea", body: "#f7c8d0" },
  { id: "wronged", label: "委屈", caption: "我只是一头呆萌的小猪呀", bg: "#fdeef0", body: "#f9d4da" },
  { id: "happy", label: "开心", caption: "今天也最喜欢你啦", bg: "#fff6e0", body: "#fbd9c0" },
  { id: "sleepy", label: "困了", caption: "困得眼睛都睁不开了", bg: "#eef0fb", body: "#f4cdd6" },
  { id: "angry", label: "生气", caption: "你这只坏猪真的要把我气死", bg: "#fdece6", body: "#f6bfc6" },
  { id: "shy", label: "害羞", caption: "别看我啦，会脸红的", bg: "#fdf0f6", body: "#f9ccd6" },
];

function pigSvg(s) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="${s.bg}"/>
  <ellipse cx="160" cy="180" rx="98" ry="86" fill="${s.body}"/>
  <ellipse cx="104" cy="112" rx="30" ry="34" fill="${s.body}" transform="rotate(-24 104 112)"/>
  <ellipse cx="216" cy="112" rx="30" ry="34" fill="${s.body}" transform="rotate(24 216 112)"/>
  <ellipse cx="104" cy="116" rx="16" ry="19" fill="#e9a7b4" transform="rotate(-24 104 116)"/>
  <ellipse cx="216" cy="116" rx="16" ry="19" fill="#e9a7b4" transform="rotate(24 216 116)"/>
  <circle cx="128" cy="164" r="9" fill="#3a2b2f"/>
  <circle cx="192" cy="164" r="9" fill="#3a2b2f"/>
  <circle cx="131" cy="161" r="3" fill="#fff"/>
  <circle cx="195" cy="161" r="3" fill="#fff"/>
  <ellipse cx="160" cy="204" rx="40" ry="30" fill="#efa9b6"/>
  <ellipse cx="147" cy="204" rx="7" ry="10" fill="#c97f8e"/>
  <ellipse cx="173" cy="204" rx="7" ry="10" fill="#c97f8e"/>
  <ellipse cx="98" cy="196" rx="16" ry="10" fill="#f3b0bc" opacity="0.75"/>
  <ellipse cx="222" cy="196" rx="16" ry="10" fill="#f3b0bc" opacity="0.75"/>
  <rect x="0" y="252" width="320" height="68" fill="rgba(214,64,64,0.92)"/>
  <text x="160" y="284" font-family="PingFang SC, Noto Sans SC, sans-serif" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">${s.caption.slice(0, 12)}</text>
  <text x="160" y="308" font-family="PingFang SC, Noto Sans SC, sans-serif" font-size="21" font-weight="700" fill="#fff" text-anchor="middle">${s.caption.slice(12)}</text>
</svg>`;
}

const manifest = [];
for (const s of STICKERS) {
  const file = `${s.id}.svg`;
  writeFileSync(join(target, file), pigSvg(s));
  manifest.push({ id: s.id, label: s.label, caption: s.caption, file });
}
writeFileSync(
  join(target, "manifest.json"),
  JSON.stringify({ source: "Pneuma 自绘内置表情包", stickers: manifest }, null, 2),
);
console.log(`已生成内置表情包：${STICKERS.length} 张`);