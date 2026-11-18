import { useEffect, useState } from "react";

interface ToastItem {
  id: number;
  text: string;
  error: boolean;
}

let seq = 0;

export function toast(text: string, error = false): void {
  window.dispatchEvent(
    new CustomEvent("pneuma-toast", { detail: { text, error } }),
  );
}

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string; error?: boolean }>)
        .detail;
      if (!detail?.text) return;
      const id = ++seq;
      setItems((list) => [
        ...list.slice(-2),
        { id, text: detail.text, error: Boolean(detail.error) },
      ]);
      setTimeout(
        () => setItems((list) => list.filter((t) => t.id !== id)),
        3400,
      );
    };
    window.addEventListener("pneuma-toast", on);
    return () => window.removeEventListener("pneuma-toast", on);
  }, []);

  if (!items.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.error ? "error" : ""}`}>
          <span className="dot" />
          {t.text}
        </div>
      ))}
    </div>
  );
}