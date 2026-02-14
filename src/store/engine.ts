/**
 * 全局 engine 实例
 *
 * 独立于任何 store, 所有 store 共享同一个 mutation queue.
 * 各 store 通过 import engine 来创建 transaction.
 */

import {
  createOptimisticEngine,
  type MutationSnapshot,
} from "../lib/optimistic-engine";

/** 外部注入的 queue 变更回调 (由 UI store 设置) */
let _onQueueChange: ((snapshots: MutationSnapshot[]) => void) | null = null;

export function setQueueChangeListener(
  fn: (snapshots: MutationSnapshot[]) => void
) {
  _onQueueChange = fn;
}

export const engine = createOptimisticEngine({
  maxRetries: 0,
  onMutationError: (snapshot, error) => {
    console.warn(`[Optimistic] Rolled back: ${snapshot.actionName}`, error);
  },
  onMutationSuccess: (snapshot) => {
    console.log(`[Optimistic] Success: ${snapshot.actionName}`);
  },
  onQueueChange: (snapshots) => {
    _onQueueChange?.(snapshots);
  },
});
