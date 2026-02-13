import { TaskBoard } from "./components/TaskBoard";
import { MutationPanel } from "./components/MutationPanel";
import { ApiControls } from "./components/ApiControls";
import { ToastContainer } from "./components/Toast";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-gray-800">
          ⚡ Zustand Optimistic Update Demo
        </h1>
        <p className="mt-0.5 text-xs text-gray-400">
          Immer Patches + Mutation Queue + Auto Rollback — 感知零延迟的 UX
        </p>
      </header>

      {/* Main */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-[1fr_320px] gap-6">
          {/* Left: Task Board */}
          <div>
            <TaskBoard />

            {/* Instructions */}
            <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-4">
              <h3 className="text-xs font-bold text-gray-600">🧪 试试这些操作:</h3>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li>1. <strong>点击任务标题</strong> → 编辑后回车 → 观察 UI 立即更新, 右侧 Queue 显示 mutation 状态</li>
                <li>2. <strong>点击 "→ Doing"</strong> → 任务立即移动到目标列, API 异步执行</li>
                <li>3. <strong>调高失败率到 70%+</strong> → 重复操作 → 观察失败后自动回滚</li>
                <li>4. <strong>调高延迟 + 快速连续操作</strong> → 观察多个 pending mutations 的 rebase 行为</li>
                <li>5. <strong>新建任务</strong> → 观察临时 ID → 成功后替换为 server ID</li>
              </ul>
            </div>
          </div>

          {/* Right: Debug Panel */}
          <div className="space-y-4">
            <ApiControls />
            <MutationPanel />
          </div>
        </div>
      </div>

      {/* Toast */}
      <ToastContainer />
    </div>
  );
}
