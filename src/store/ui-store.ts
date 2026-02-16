/**
 * UI Store
 *
 * 持有 mutation queue 的快照和 toast, 供 MutationPanel / Toast 订阅.
 * 与 engine 通过 setQueueChangeListener 桥接.
 */

import { create } from "zustand";
import { type MutationSnapshot } from "../lib/optimistic-engine";
import { setQueueChangeListener } from "./engine";

const TOAST_TTL_MS = 3000;

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error";
  timestamp: number;
}

interface UIState {
  queueSnapshot: MutationSnapshot[];
  toasts: ToastItem[];
  pruneToasts: () => void;
}

const seenMutationIds = new Set<string>();

export const useUIStore = create<UIState>()((set) => {
  // 桥接 engine → store
  setQueueChangeListener((snapshots) => {
    const freshToasts: ToastItem[] = [];

    for (const mutation of snapshots) {
      if (seenMutationIds.has(mutation.id)) continue;

      if (mutation.status === "success") {
        seenMutationIds.add(mutation.id);
        freshToasts.push({
          id: mutation.id,
          message: `✅ ${mutation.actionName}`,
          type: "success",
          timestamp: Date.now(),
        });
      } else if (
        mutation.status === "rolled-back" ||
        mutation.status === "failed"
      ) {
        seenMutationIds.add(mutation.id);
        freshToasts.push({
          id: mutation.id,
          message: `↩️ 已回滚: ${mutation.actionName}`,
          type: "error",
          timestamp: Date.now(),
        });
      }
    }

    set((state) => ({
      queueSnapshot: snapshots,
      toasts:
        freshToasts.length > 0 ? [...state.toasts, ...freshToasts] : state.toasts,
    }));
  });

  return {
    queueSnapshot: [],
    toasts: [],
    pruneToasts: () => {
      set((state) => ({
        toasts: state.toasts.filter(
          (item) => Date.now() - item.timestamp < TOAST_TTL_MS
        ),
      }));
    },
  };
});
