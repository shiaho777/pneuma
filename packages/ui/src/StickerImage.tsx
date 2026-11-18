import fragile from "./assets/stickers/fragile.svg";
import wronged from "./assets/stickers/wronged.svg";
import happy from "./assets/stickers/happy.svg";
import sleepy from "./assets/stickers/sleepy.svg";
import angry from "./assets/stickers/angry.svg";
import shy from "./assets/stickers/shy.svg";

const BUILTIN: Record<string, string> = {
  fragile,
  wronged,
  happy,
  sleepy,
  angry,
  shy,
};

export function StickerImage({
  src,
  label,
}: {
  src?: string;
  label: string;
}) {
  const id = src?.startsWith("sticker:") ? src.slice(8) : undefined;
  const url = id ? BUILTIN[id] : src;
  if (!url) {
    return <div className="bubble assistant sticker-fallback">🐷 {label}</div>;
  }
  return <img className="sticker-img" src={url} alt={label} loading="lazy" />;
}