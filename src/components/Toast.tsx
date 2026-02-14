import { useEffect, useState, useRef } from "react";
import { useUIStore } from "../store/ui-store";

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error";
  timestamp: number;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const queueSnapshot = useUIStore((s) => s.queueSnapshot);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    for (const m of queueSnapshot) {
      if (seenIds.current.has(m.id)) continue;

      if (m.status === "success") {
        seenIds.current.add(m.id);
        setToasts((prev) => [
          ...prev,
          {
            id: m.id,
            message: `✅ ${m.actionName}`,
            type: "success",
            timestamp: Date.now(),
          },
        ]);
      } else if (m.status === "rolled-back" || m.status === "failed") {
        seenIds.current.add(m.id);
        setToasts((prev) => [
          ...prev,
          {
            id: m.id,
            message: `↩️ 已回滚: ${m.actionName}`,
            type: "error",
            timestamp: Date.now(),
          },
        ]);
      }
    }
  }, [queueSnapshot]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      setToasts((prev) => prev.filter((t) => Date.now() - t.timestamp < 3000));
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id + t.timestamp}
          className={`
            animate-slide-in rounded-lg px-4 py-2.5 text-xs font-medium shadow-lg
            ${
              t.type === "success"
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-200 bg-red-50 text-red-700"
            }
          `}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
