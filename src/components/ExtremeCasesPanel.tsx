import { useTaskStore } from "../store/task-store";
import { useUserStore } from "../store/user-store";
import { apiConfig, apiTestTools } from "../mock/api";

function nextStatus(status: "todo" | "doing" | "done") {
  if (status === "todo") return "doing" as const;
  if (status === "doing") return "done" as const;
  return "todo" as const;
}

export function ExtremeCasesPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTaskTitle = useTaskStore((s) => s.updateTaskTitle);
  const moveTask = useTaskStore((s) => s.moveTask);
  const assignTask = useTaskStore((s) => s.assignTask);
  const createTask = useTaskStore((s) => s.createTask);
  const users = useUserStore((s) => s.users);

  const userIds = Object.keys(users);
  const stableTask = Object.values(tasks).find((task) => task.syncState === "synced");

  const runMiddleFailureChain = () => {
    if (!stableTask) return;

    apiTestTools.clearBehaviors();
    apiTestTools.enqueueBehaviors([
      { opPrefix: "updateTask", delayMs: 500, fail: false },
      { opPrefix: "moveTask", delayMs: 500, fail: true },
      { opPrefix: "moveTask", delayMs: 500, fail: true },
      { opPrefix: "updateTask", delayMs: 300, fail: false },
    ]);

    const t = String(Date.now()).slice(-4);
    updateTaskTitle(stableTask.id, `[case-A1 ${t}]`);
    moveTask(stableTask.id, nextStatus(stableTask.status));
    updateTaskTitle(stableTask.id, `[case-A2 ${t}]`);
  };

  const runCreateDependentRollback = () => {
    if (userIds.length === 0) return;

    apiTestTools.clearBehaviors();
    apiTestTools.enqueueBehaviors([
      { opPrefix: "createTask", delayMs: 1000, fail: true },
      { opPrefix: "createTask", delayMs: 1000, fail: true },
    ]);

    const taskId = createTask("[case-B] create fail with dependents", "todo");
    if (!taskId) return;

    moveTask(taskId, "doing");
    assignTask(taskId, userIds[0]);
  };

  const runAssignBurstConflict = () => {
    if (!stableTask || userIds.length < 2) return;

    apiTestTools.clearBehaviors();
    apiTestTools.enqueueBehaviors([
      { opPrefix: "updateTask", delayMs: 1200, fail: false },
      { opPrefix: "updateTask", delayMs: 500, fail: true },
      { opPrefix: "updateTask", delayMs: 500, fail: true },
      { opPrefix: "updateTask", delayMs: 200, fail: false },
    ]);

    assignTask(stableTask.id, userIds[0]);
    assignTask(stableTask.id, userIds[1]);
    assignTask(stableTask.id, null);
  };

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-700">🧨 Extreme Cases</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          一键注入极端序列, 验证冲突调度、回滚重放和跨 store 一致性
        </p>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        <button
          onClick={runMiddleFailureChain}
          className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-left text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100"
        >
          Case A: 中间 mutation 失败 + 链式回滚重放
        </button>

        <button
          onClick={runCreateDependentRollback}
          className="w-full rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-left text-[11px] font-medium text-orange-700 transition-colors hover:bg-orange-100"
        >
          Case B: create 失败 + 依赖 mutation 连锁回滚
        </button>

        <button
          onClick={runAssignBurstConflict}
          className="w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-left text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
        >
          Case C: 同任务高频 assign 冲突（中间失败 + 串行调度）
        </button>

        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-[10px] text-gray-500">
          当前随机失败率: {Math.round(apiConfig.failureRate * 100)}%
          <br />
          每次 Case 会注入 deterministic 行为, 优先于随机失败。
        </div>
      </div>
    </div>
  );
}
