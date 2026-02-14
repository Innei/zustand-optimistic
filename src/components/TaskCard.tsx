import { useState, useRef, useEffect } from "react";
import { useTaskStore, type Task } from "../store/task-store";
import { useUserStore } from "../store/user-store";

export function TaskCard({ task }: { task: Task }) {
  const { updateTaskTitle, moveTask, deleteTask, assignTask } = useTaskStore();
  const users = useUserStore((s) => s.users);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTemp = task.id.startsWith("temp_");
  const assignee = task.assigneeId ? users[task.assigneeId] : null;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setEditValue(task.title);
  }, [task.title, editing]);

  const handleSave = () => {
    setEditing(false);
    if (editValue.trim() && editValue !== task.title) {
      updateTaskTitle(task.id, editValue.trim());
    } else {
      setEditValue(task.title);
    }
  };

  const STATUS_OPTIONS = [
    { value: "todo" as const, label: "📋 Todo" },
    { value: "doing" as const, label: "🔨 Doing" },
    { value: "done" as const, label: "✅ Done" },
  ];

  const userList = Object.values(users);

  return (
    <div
      className={`
        group relative rounded-lg border bg-white p-3 shadow-sm
        transition-all duration-200
        ${isTemp ? "border-dashed border-blue-300 bg-blue-50/50" : "border-gray-200"}
        hover:shadow-md
      `}
    >
      {/* Title */}
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setEditValue(task.title);
              setEditing(false);
            }
          }}
          className="w-full rounded border border-blue-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-400"
        />
      ) : (
        <div
          className="cursor-pointer text-sm font-medium text-gray-800 hover:text-blue-600"
          onClick={() => setEditing(true)}
          title="点击编辑标题"
        >
          {task.title}
          {isTemp && (
            <span className="ml-1.5 inline-block animate-pulse text-xs text-blue-400">
              (创建中...)
            </span>
          )}
        </div>
      )}

      {/* Assignee */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400">指派:</span>
        <select
          value={task.assigneeId ?? ""}
          onChange={(e) => assignTask(task.id, e.target.value || null)}
          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-600 outline-none focus:border-blue-300"
        >
          <option value="">无</option>
          {userList.map((u) => (
            <option key={u.id} value={u.id}>
              {u.avatar} {u.name}
            </option>
          ))}
        </select>
        {assignee && (
          <span className="text-xs" title={assignee.name}>
            {assignee.avatar}
          </span>
        )}
      </div>

      {/* Move Buttons */}
      <div className="mt-2 flex items-center gap-1">
        {STATUS_OPTIONS.filter((s) => s.value !== task.status).map((s) => (
          <button
            key={s.value}
            onClick={() => moveTask(task.id, s.value)}
            className="rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            → {s.label}
          </button>
        ))}

        <button
          onClick={() => deleteTask(task.id)}
          className="ml-auto rounded px-1.5 py-0.5 text-xs text-red-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          删除
        </button>
      </div>

      <div className="mt-1.5 font-mono text-[10px] text-gray-300">
        {task.id}
      </div>
    </div>
  );
}
