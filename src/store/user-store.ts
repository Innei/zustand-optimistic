/**
 * User Store
 *
 * 用 createStore (vanilla) 创建, 再用 useStore 包装给 React.
 * 这样 userStore 是纯粹的 StoreApi, 可以安全传给 engine.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { immer } from "zustand/middleware/immer";

// ============================================================
// Types
// ============================================================

export interface User {
  id: string;
  name: string;
  avatar: string;
  assignedTaskIds: string[];
}

export interface UserState {
  users: Record<string, User>;
}

// ============================================================
// Initial Data
// ============================================================

const INITIAL_USERS: Record<string, User> = {
  user1: {
    id: "user1",
    name: "Alice",
    avatar: "👩‍💻",
    assignedTaskIds: ["task2"],
  },
  user2: {
    id: "user2",
    name: "Bob",
    avatar: "👨‍🔧",
    assignedTaskIds: ["task3"],
  },
  user3: {
    id: "user3",
    name: "Charlie",
    avatar: "🧑‍🎨",
    assignedTaskIds: [],
  },
};

// ============================================================
// Vanilla Store (供 engine 使用)
// ============================================================

export const userStore = createStore<UserState>()(
  immer(() => ({
    users: INITIAL_USERS,
  }))
);

// ============================================================
// React Hook
// ============================================================

export function useUserStore(): UserState;
export function useUserStore<T>(selector: (state: UserState) => T): T;
export function useUserStore<T>(selector?: (state: UserState) => T) {
  return useStore(userStore, selector!);
}
