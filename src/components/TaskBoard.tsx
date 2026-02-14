import { useState } from "react";
import { useTaskStore, type TaskStatus, type Task } from "../store/task-store";
import { TaskCard } from "./TaskCard";

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "todo", label: "📋 Todo", color: "bg-gray-50 border-gray-200" },
  {
    status: "doing",
    label: "🔨 In Progress",
    color: "bg-amber-50 border-amber-200",
  },
  { status: "done", label: "✅ Done", color: "bg-green-50 border-green-200" },
];

export function TaskBoard() {
  const tasks = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map((col) => (
        <Column
          key={col.status}
          {...col}
          tasks={Object.values(tasks)
            .filter((t) => t.status === col.status)
            .sort((a, b) => a.createdAt - b.createdAt)}
          onCreateTask={(title) => createTask(title, col.status)}
        />
      ))}
    </div>
  );
}

function Column({
  label,
  color,
  tasks,
  onCreateTask,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  onCreateTask: (title: string) => void;
}) {
  const [newTitle, setNewTitle] = useState("");

  const handleCreate = () => {
    if (newTitle.trim()) {
      onCreateTask(newTitle.trim());
      setNewTitle("");
    }
  };

  return (
    <div className={`rounded-xl border-2 ${color} p-3`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">{label}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500 shadow-sm">
          {tasks.length}
        </span>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      <div className="mt-3 flex gap-1.5">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="新建任务..."
          className="flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-gray-300 focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
        />
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim()}
          className="rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
