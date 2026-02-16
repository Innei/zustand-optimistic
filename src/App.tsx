import { TaskBoard } from "./components/TaskBoard";
import { UserPanel } from "./components/UserPanel";
import { MutationPanel } from "./components/MutationPanel";
import { ApiControls } from "./components/ApiControls";
import { ExtremeCasesPanel } from "./components/ExtremeCasesPanel";
import { ToastContainer } from "./components/Toast";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-gray-800">
          ⚡ Zustand Optimistic Update Demo
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          Multi-Store · Immer Patches · Auto Rollback — TaskStore + UserStore
          跨 store 联动
        </p>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-[1fr_320px] gap-6">
          {/* Left */}
          <div>
            <TaskBoard />

            <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-4">
              <h3 className="text-xs font-bold text-gray-600">
                🧪 试试这些操作:
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li>
                  1. <strong>分配用户</strong> → 选择任务卡片上的用户下拉框 →
                  观察右侧 Users 面板立即更新 (跨 store)
                </li>
                <li>
                  2. <strong>调高失败率</strong> → 分配用户 → 观察 TaskStore 和
                  UserStore 一起回滚
                </li>
                <li>
                  3. <strong>删除有 assignee 的任务</strong> → 观察 user 的
                  assignedTaskIds 也被清理
                </li>
                <li>
                  4. <strong>快速连续操作</strong> → 观察 Mutation Queue
                  中多个并发 mutation
                </li>
              </ul>
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">
            <ApiControls />
            <ExtremeCasesPanel />
            <UserPanel />
            <MutationPanel />
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
