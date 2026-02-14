/**
 * UI Store
 *
 * 持有 mutation queue 的快照, 供 MutationPanel / Toast 订阅.
 * 与 engine 通过 setQueueChangeListener 桥接.
 */

import { create } from "zustand";
import { type MutationSnapshot } from "../lib/optimistic-engine";
import { setQueueChangeListener } from "./engine";

interface UIState {
  queueSnapshot: MutationSnapshot[];
}

export const useUIStore = create<UIState>()((_set) => {
  // 桥接 engine → store
  setQueueChangeListener((snapshots) => {
    _set({ queueSnapshot: snapshots });
  });

  return {
    queueSnapshot: [],
  };
});
