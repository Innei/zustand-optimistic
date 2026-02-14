/**
 * Task Store
 *
 * 用 createStore (vanilla) 创建, 再用 useStore 包装给 React.
 * 跨 store 操作 (assign/unassign) 通过 engine transaction 实现.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { immer } from "zustand/middleware/immer";
import { engine } from "./engine";
import { userStore } from "./user-store";
import { api } from "../mock/api";

// ============================================================
// Types
// ============================================================

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeId: string | null;
  createdAt: number;
}

interface TaskState {
  tasks: Record<string, Task>;
}

interface TaskActions {
  updateTaskTitle: (taskId: string, title: string) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  createTask: (title: string, status: TaskStatus) => void;
  assignTask: (taskId: string, userId: string | null) => void;
}

type Store = TaskState & TaskActions;

// ============================================================
// Initial Data
// ============================================================

const INITIAL_TASKS: Record<string, Task> = {
  task1: {
    id: "task1",
    title: "设计数据模型",
    status: "done",
    assigneeId: null,
    createdAt: Date.now() - 5000,
  },
  task2: {
    id: "task2",
    title: "实现乐观更新引擎",
    status: "doing",
    assigneeId: "user1",
    createdAt: Date.now() - 4000,
  },
  task3: {
    id: "task3",
    title: "编写回滚逻辑",
    status: "doing",
    assigneeId: "user2",
    createdAt: Date.now() - 3000,
  },
  task4: {
    id: "task4",
    title: "添加 Toast 提示",
    status: "todo",
    assigneeId: null,
    createdAt: Date.now() - 2000,
  },
  task5: {
    id: "task5",
    title: "集成测试",
    status: "todo",
    assigneeId: null,
    createdAt: Date.now() - 1000,
  },
  task6: {
    id: "task6",
    title: "性能优化",
    status: "todo",
    assigneeId: null,
    createdAt: Date.now(),
  },
};

// ============================================================
// Vanilla Store
// ============================================================

export const taskStore = createStore<Store>()(
  immer((set, get) => ({
    tasks: INITIAL_TASKS,

    updateTaskTitle: (taskId, title) => {
      const tx = engine.createTransaction(
        `updateTitle(${taskId})`,
        taskStore
      );

      tx.set((draft) => {
        const task = draft.tasks[taskId];
        if (!task) return;
        task.title = title;
      });

      tx.mutation = async () => {
        await api.updateTask(taskId, { title });
      };

      tx.commit();
    },

    moveTask: (taskId, newStatus) => {
      const tx = engine.createTransaction(
        `moveTask(${taskId} → ${newStatus})`,
        taskStore
      );

      tx.set((draft) => {
        const task = draft.tasks[taskId];
        if (!task) return;
        task.status = newStatus;
      });

      tx.mutation = async () => {
        await api.moveTask(taskId, newStatus);
      };

      tx.commit();
    },

    deleteTask: (taskId) => {
      const currentTask = get().tasks[taskId];
      const tx = engine.createTransaction(`deleteTask(${taskId})`, taskStore);

      // 如果有 assignee, 先从 userStore 中移除引用
      if (currentTask?.assigneeId) {
        const assigneeId = currentTask.assigneeId;
        tx.set(userStore, (draft) => {
          const user = draft.users[assigneeId];
          if (user) {
            user.assignedTaskIds = user.assignedTaskIds.filter(
              (id) => id !== taskId
            );
          }
        });
      }

      tx.set((draft) => {
        delete draft.tasks[taskId];
      });

      tx.mutation = async () => {
        await api.deleteTask(taskId);
      };

      tx.commit();
    },

    createTask: (title, status) => {
      const tempId = `temp_${Date.now()}`;
      const tx = engine.createTransaction(`createTask("${title}")`, taskStore);

      tx.set((draft) => {
        draft.tasks[tempId] = {
          id: tempId,
          title,
          status,
          assigneeId: null,
          createdAt: Date.now(),
        };
      });

      tx.mutation = async () => {
        const result = await api.createTask({ title, status });
        set((draft) => {
          const task = draft.tasks[tempId];
          if (!task) return;
          task.id = result.id;
          draft.tasks[result.id] = task;
          delete draft.tasks[tempId];
        });
      };

      tx.commit();
    },

    assignTask: (taskId, userId) => {
      const currentTask = get().tasks[taskId];
      if (!currentTask) return;

      const oldAssigneeId = currentTask.assigneeId;
      if (oldAssigneeId === userId) return;

      const label = userId
        ? `assignTask(${taskId} → ${userId})`
        : `unassignTask(${taskId})`;

      const tx = engine.createTransaction(label, taskStore);

      // 1. TaskStore: 更新 assigneeId
      tx.set((draft) => {
        draft.tasks[taskId].assigneeId = userId;
      });

      // 2. UserStore: 从旧 user 移除
      if (oldAssigneeId) {
        tx.set(userStore, (draft) => {
          const user = draft.users[oldAssigneeId];
          if (user) {
            user.assignedTaskIds = user.assignedTaskIds.filter(
              (id) => id !== taskId
            );
          }
        });
      }

      // 3. UserStore: 添加到新 user
      if (userId) {
        tx.set(userStore, (draft) => {
          const user = draft.users[userId];
          if (user) {
            user.assignedTaskIds.push(taskId);
          }
        });
      }

      tx.mutation = async () => {
        await api.updateTask(taskId, { assigneeId: userId });
      };

      tx.commit();
    },
  }))
);

// ============================================================
// React Hook
// ============================================================

export function useTaskStore(): Store;
export function useTaskStore<T>(selector: (state: Store) => T): T;
export function useTaskStore<T>(selector?: (state: Store) => T) {
  return useStore(taskStore, selector!);
}
