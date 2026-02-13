import { useAppStore } from "../store/app-store";
import type { MutationStatus } from "../lib/optimistic-engine";

const STATUS_STYLES: Record<
  MutationStatus,
  { bg: string; text: string; label: string }
> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Pending" },
  inflight: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    label: "In Flight ✈️",
  },
  success: { bg: "bg-green-100", text: "text-green-700", label: "Success ✅" },
  failed: { bg: "bg-red-100", text: "text-red-700", label: "Failed ❌" },
  "rolled-back": {
    bg: "bg-red-50",
    text: "text-red-500",
    label: "Rolled Back ↩️",
  },
};

export function MutationPanel() {
  const queueSnapshot = useAppStore((s) => s.queueSnapshot);

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-700">
          🔄 Mutation Queue
        </h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          实时展示乐观更新的 mutation 生命周期
        </p>
      </div>

      <div className="max-h-[500px] overflow-y-auto">
        {queueSnapshot.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-300">
            暂无 mutations — 试试修改任务标题或移动任务
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {queueSnapshot.map((m) => {
              const style = STATUS_STYLES[m.status];
              return (
                <div key={m.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
                    >
                      {style.label}
                    </span>
                    <span className="truncate text-xs font-medium text-gray-600">
                      {m.actionName}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-[10px] text-gray-400">
                    <span>
                      patches: {m.patches.length}
                    </span>
                    <span>
                      paths: {m.affectedPaths.join(", ")}
                    </span>
                    {m.retryCount > 0 && (
                      <span className="text-orange-400">
                        retry: {m.retryCount}/{m.maxRetries}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
