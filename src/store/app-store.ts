/**
 * Demo Store - 任务看板
 *
 * 数据模型:
 * - Task: { id, title, status, order }
 * - status: 'todo' | 'doing' | 'done'
 *
 * 所有写操作通过 optimistic engine 执行
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  createOptimisticEngine,
  type Mutation,
} from "../lib/optimistic-engine";
import { api } from "../mock/api";
import type { StoreApi } from "zustand";

// ============================================================
// Types
// ============================================================

export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  order: number;
  createdAt: number;
}

interface AppState {
  tasks: Record<string, Task>;

  /** Mutation queue 的快照 (用于 UI 渲染) */
  queueSnapshot: Mutation[];
}

interface AppActions {
  updateTaskTitle: (taskId: string, title: string) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => void;
  deleteTask: (taskId: string) => void;
  createTask: (title: string, status: TaskStatus) => void;
}

type Store = AppState & AppActions;

// ============================================================
// Initial Data
// ============================================================

const INITIAL_TASKS: Record<string, Task> = {
  task1: {
    id: "task1",
    title: "设计数据模型",
    status: "done",
    order: 0,
    createdAt: Date.now() - 5000,
  },
  task2: {
    id: "task2",
    title: "实现乐观更新引擎",
    status: "doing",
    order: 0,
    createdAt: Date.now() - 4000,
  },
  task3: {
    id: "task3",
    title: "编写回滚逻辑",
    status: "doing",
    order: 1,
    createdAt: Date.now() - 3000,
  },
  task4: {
    id: "task4",
    title: "添加 Toast 提示",
    status: "todo",
    order: 0,
    createdAt: Date.now() - 2000,
  },
  task5: {
    id: "task5",
    title: "集成测试",
    status: "todo",
    order: 1,
    createdAt: Date.now() - 1000,
  },
  task6: {
    id: "task6",
    title: "性能优化",
    status: "todo",
    order: 2,
    createdAt: Date.now(),
  },
};

// ============================================================
// Store
// ============================================================

export const useAppStore = create<Store>()(
  immer((set, _get, storeApi) => {
    const engine = createOptimisticEngine(
      storeApi as unknown as StoreApi<Store>,
      {
        maxRetries: 0,
        onMutationError: (mutation, error) => {
          console.warn(
            `[Optimistic] Rolled back: ${mutation.actionName}`,
            error
          );
          // queueSnapshot 会通过 onQueueChange 自动更新
        },
        onMutationSuccess: (mutation) => {
          console.log(`[Optimistic] Success: ${mutation.actionName}`);
        },
        onQueueChange: (mutations) => {
          // 将 queue 状态同步到 store, 让 React 可以订阅
          set({ queueSnapshot: mutations });
        },
      }
    );

    return {
      tasks: INITIAL_TASKS,
      queueSnapshot: [],

      updateTaskTitle: (taskId, title) => {
        const tx = engine.createTransaction(`updateTitle(${taskId})`);

        tx.optimistic = (draft) => {
          const task = draft.tasks[taskId];
          if (!task) return;
          task.title = title;
        };

        tx.mutation = async () => {
          await api.updateTask(taskId, { title });
        };

        tx.commit();
      },

      moveTask: (taskId, newStatus) => {
        const tx = engine.createTransaction(
          `moveTask(${taskId} → ${newStatus})`
        );

        tx.optimistic = (draft) => {
          const task = draft.tasks[taskId];
          if (!task) return;
          task.status = newStatus;
        };

        tx.mutation = async () => {
          await api.moveTask(taskId, newStatus);
        };

        tx.commit();
      },

      deleteTask: (taskId) => {
        const tx = engine.createTransaction(`deleteTask(${taskId})`);

        tx.optimistic = (draft) => {
          delete draft.tasks[taskId];
        };

        tx.mutation = async () => {
          await api.deleteTask(taskId);
        };

        tx.commit();
      },

      createTask: (title, status) => {
        const tempId = `temp_${Date.now()}`;
        const tx = engine.createTransaction(`createTask("${title}")`);

        tx.optimistic = (draft) => {
          draft.tasks[tempId] = {
            id: tempId,
            title,
            status,
            order: Object.values(draft.tasks).filter(
              (t) => t.status === status
            ).length,
            createdAt: Date.now(),
          };
        };

        tx.mutation = async () => {
          const result = await api.createTask({ title, status });
          // 成功后替换 tempId
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
    };
  })
);
