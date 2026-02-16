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
export type TaskSyncState = "pending" | "synced";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeId: string | null;
  createdAt: number;
  serverId: string;
  syncState: TaskSyncState;
}

interface TaskState {
  tasks: Record<string, Task>;
}

interface TaskActions {
  updateTaskTitle: (taskId: string, title: string) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  createTask: (title: string, status: TaskStatus) => string;
  assignTask: (taskId: string, userId: string | null) => void;
}

type Store = TaskState & TaskActions;

let clientTaskCounter = 0;

function createClientTaskId() {
  return `task_local_${Date.now()}_${++clientTaskCounter}`;
}

function getRemoteTaskId(task: Task) {
  return task.serverId || task.id;
}

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
    serverId: "task1",
    syncState: "synced",
  },
  task2: {
    id: "task2",
    title: "实现乐观更新引擎",
    status: "doing",
    assigneeId: "user1",
    createdAt: Date.now() - 4000,
    serverId: "task2",
    syncState: "synced",
  },
  task3: {
    id: "task3",
    title: "编写回滚逻辑",
    status: "doing",
    assigneeId: "user2",
    createdAt: Date.now() - 3000,
    serverId: "task3",
    syncState: "synced",
  },
  task4: {
    id: "task4",
    title: "添加 Toast 提示",
    status: "todo",
    assigneeId: null,
    createdAt: Date.now() - 2000,
    serverId: "task4",
    syncState: "synced",
  },
  task5: {
    id: "task5",
    title: "集成测试",
    status: "todo",
    assigneeId: null,
    createdAt: Date.now() - 1000,
    serverId: "task5",
    syncState: "synced",
  },
  task6: {
    id: "task6",
    title: "性能优化",
    status: "todo",
    assigneeId: null,
    createdAt: Date.now(),
    serverId: "task6",
    syncState: "synced",
  },
};

// ============================================================
// Vanilla Store
// ============================================================

export const taskStore = createStore<Store>()(
  immer((set, get) => ({
    tasks: INITIAL_TASKS,

    updateTaskTitle: (taskId, title) => {
      const currentTask = get().tasks[taskId];
      const trimmed = title.trim();
      if (!currentTask || !trimmed || currentTask.title === trimmed) return;

      const remoteTaskId = getRemoteTaskId(currentTask);
      const tx = engine.createTransaction(`updateTitle(${taskId})`, taskStore);

      tx.set((draft) => {
        const task = draft.tasks[taskId];
        if (!task) return;
        task.title = trimmed;
      });

      tx.mutation = async () => {
        await api.updateTask(remoteTaskId, { title: trimmed });
      };

      tx.commit();
    },

    moveTask: (taskId, newStatus) => {
      const currentTask = get().tasks[taskId];
      if (!currentTask || currentTask.status === newStatus) return;

      const remoteTaskId = getRemoteTaskId(currentTask);
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
        await api.moveTask(remoteTaskId, newStatus);
      };

      tx.commit();
    },

    deleteTask: (taskId) => {
      const currentTask = get().tasks[taskId];
      if (!currentTask) return;

      const remoteTaskId = getRemoteTaskId(currentTask);
      const tx = engine.createTransaction(`deleteTask(${taskId})`, taskStore);

      // 如果有 assignee, 先从 userStore 中移除引用
      if (currentTask.assigneeId) {
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
        await api.deleteTask(remoteTaskId);
      };

      tx.commit();
    },

    createTask: (title, status) => {
      const trimmed = title.trim();
      if (!trimmed) return "";

      const clientId = createClientTaskId();
      const tx = engine.createTransaction(`createTask("${trimmed}")`, taskStore);

      tx.set((draft) => {
        draft.tasks[clientId] = {
          id: clientId,
          title: trimmed,
          status,
          assigneeId: null,
          createdAt: Date.now(),
          serverId: clientId,
          syncState: "pending",
        };
      });

      tx.mutation = async () => {
        const result = await api.createTask({ id: clientId, title: trimmed, status });
        set((draft) => {
          const task = draft.tasks[clientId];
          if (!task) return;
          task.serverId = result.id;
          task.syncState = "synced";
        });
      };

      tx.commit();
      return clientId;
    },

    assignTask: (taskId, userId) => {
      const currentTask = get().tasks[taskId];
      if (!currentTask) return;

      const oldAssigneeId = currentTask.assigneeId;
      if (oldAssigneeId === userId) return;

      const remoteTaskId = getRemoteTaskId(currentTask);
      const label = userId
        ? `assignTask(${taskId} → ${userId})`
        : `unassignTask(${taskId})`;

      const tx = engine.createTransaction(label, taskStore);

      // 1. TaskStore: 更新 assigneeId
      tx.set((draft) => {
        const task = draft.tasks[taskId];
        if (!task) return;
        task.assigneeId = userId;
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
          if (user && !user.assignedTaskIds.includes(taskId)) {
            user.assignedTaskIds.push(taskId);
          }
        });
      }

      tx.mutation = async () => {
        await api.updateTask(remoteTaskId, { assigneeId: userId });
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
