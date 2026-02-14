import { useUserStore } from "../store/user-store";
import { useTaskStore } from "../store/task-store";

/**
 * 用户面板: 展示每个用户及其被分配的任务
 *
 * 用于验证跨 store 乐观更新:
 * - 在 TaskCard 中 assign 用户后, 这里应该立即更新
 * - 失败回滚时, 两个 store 一起恢复
 */
export function UserPanel() {
  const users = useUserStore((s) => s.users);
  const tasks = useTaskStore((s) => s.tasks);

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-bold text-gray-700">👥 Users</h2>
        <p className="mt-0.5 text-[11px] text-gray-400">
          跨 store 联动: assign 任务时同时更新 TaskStore + UserStore
        </p>
      </div>

      <div className="divide-y divide-gray-50">
        {Object.values(users).map((user) => (
          <div key={user.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{user.avatar}</span>
              <span className="text-sm font-medium text-gray-700">
                {user.name}
              </span>
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                {user.assignedTaskIds.length} tasks
              </span>
            </div>

            {user.assignedTaskIds.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {user.assignedTaskIds.map((taskId) => {
                  const task = tasks[taskId];
                  return (
                    <span
                      key={taskId}
                      className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600"
                      title={task?.title ?? taskId}
                    >
                      {task ? task.title : taskId}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-gray-300">暂无分配的任务</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
