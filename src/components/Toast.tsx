import { useEffect } from "react";
import { useUIStore } from "../store/ui-store";

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const pruneToasts = useUIStore((s) => s.pruneToasts);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      pruneToasts();
    }, 500);
    return () => clearInterval(timer);
  }, [toasts.length, pruneToasts]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={`${t.id}_${t.timestamp}`}
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
