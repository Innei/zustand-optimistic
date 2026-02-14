/**
 * Zustand Optimistic Update Engine (Multi-Store)
 *
 * Engine 不绑定任何 store, 是纯粹的 patch 调度器.
 * Store 引用在 tx.set() 时传入, 避免环引用.
 */

import {
  type Draft,
  produceWithPatches,
  applyPatches,
  enablePatches,
  type Patch,
} from "immer";
import type { StoreApi } from "zustand";

enablePatches();

// ============================================================
// Types
// ============================================================

export type MutationStatus =
  | "pending"
  | "inflight"
  | "success"
  | "failed"
  | "rolled-back";

interface StorePatchEntry {
  patches: Patch[];
  inversePatches: Patch[];
}

export interface Mutation {
  id: string;
  timestamp: number;
  status: MutationStatus;
  storePatches: Map<StoreApi<any>, StorePatchEntry>;
  affectedPaths: string[];
  remoteFn: () => Promise<void>;
  retryCount: number;
  maxRetries: number;
  actionName?: string;
}

export interface MutationSnapshot {
  id: string;
  timestamp: number;
  status: MutationStatus;
  actionName?: string;
  patchCount: number;
  affectedPaths: string[];
  retryCount: number;
  maxRetries: number;
}

export interface OptimisticEngineOptions {
  maxRetries?: number;
  onMutationError?: (snapshot: MutationSnapshot, error: unknown) => void;
  onMutationSuccess?: (snapshot: MutationSnapshot) => void;
  onQueueChange?: (snapshots: MutationSnapshot[]) => void;
}

type Recipe<S> = (draft: Draft<S>) => void;
type RemoteFn = () => Promise<void>;

interface SetOptions {
  flush?: boolean;
}

// ============================================================
// Path Utilities
// ============================================================

export function extractAffectedPaths(patches: Patch[]): string[] {
  const paths = new Set<string>();
  for (const patch of patches) {
    const depth = Math.min(patch.path.length, 2);
    const entityPath = patch.path.slice(0, depth).join(".");
    paths.add(entityPath);
  }
  return Array.from(paths);
}

export function hasPathConflict(pathsA: string[], pathsB: string[]): boolean {
  for (const a of pathsA) {
    for (const b of pathsB) {
      if (a === b || a.startsWith(b + ".") || b.startsWith(a + ".")) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// Snapshot
// ============================================================

function toSnapshot(m: Mutation): MutationSnapshot {
  let patchCount = 0;
  for (const entry of m.storePatches.values()) {
    patchCount += entry.patches.length;
  }
  return {
    id: m.id,
    timestamp: m.timestamp,
    status: m.status,
    actionName: m.actionName,
    patchCount,
    affectedPaths: m.affectedPaths,
    retryCount: m.retryCount,
    maxRetries: m.maxRetries,
  };
}

// ============================================================
// Mutation Queue
// ============================================================

class MutationQueue {
  private queue: Mutation[] = [];
  private inflightIds = new Set<string>();
  private history: MutationSnapshot[] = [];
  private maxHistory = 20;
  private options: Required<OptimisticEngineOptions>;

  constructor(options: OptimisticEngineOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 0,
      onMutationError: options.onMutationError ?? (() => {}),
      onMutationSuccess: options.onMutationSuccess ?? (() => {}),
      onQueueChange: options.onQueueChange ?? (() => {}),
    };
  }

  get mutations(): readonly Mutation[] {
    return this.queue;
  }

  get hasPending(): boolean {
    return this.queue.some(
      (m) => m.status === "pending" || m.status === "inflight"
    );
  }

  private notify() {
    const snapshots = [...this.queue.map(toSnapshot), ...this.history];
    this.options.onQueueChange(snapshots);
  }

  private addToHistory(snapshot: MutationSnapshot) {
    this.history.unshift(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  enqueue(mutation: Mutation): void {
    this.queue.push(mutation);
    this.notify();
    this.processNext();
  }

  private processNext(): void {
    const pending = this.queue.filter(
      (m) => m.status === "pending" && !this.inflightIds.has(m.id)
    );
    for (const mutation of pending) {
      this.executeMutation(mutation);
    }
  }

  private async executeMutation(mutation: Mutation): Promise<void> {
    this.inflightIds.add(mutation.id);
    mutation.status = "inflight";
    this.notify();

    try {
      await mutation.remoteFn();

      mutation.status = "success";
      this.inflightIds.delete(mutation.id);
      this.addToHistory(toSnapshot(mutation));
      this.queue = this.queue.filter((m) => m.id !== mutation.id);
      this.notify();
      this.options.onMutationSuccess(toSnapshot(mutation));
    } catch (error) {
      mutation.retryCount++;

      if (mutation.retryCount <= mutation.maxRetries) {
        mutation.status = "pending";
        this.inflightIds.delete(mutation.id);
        this.notify();
        this.processNext();
        return;
      }

      mutation.status = "failed";
      this.inflightIds.delete(mutation.id);
      this.notify();

      this.rollback(mutation);

      const snapshot: MutationSnapshot = {
        ...toSnapshot(mutation),
        status: "rolled-back",
      };
      this.addToHistory(snapshot);
      this.queue = this.queue.filter((m) => m.id !== mutation.id);
      this.notify();
      this.options.onMutationError(snapshot, error);
    }
  }

  /**
   * Multi-Store Full Rebase
   */
  private rollback(failedMutation: Mutation): void {
    const allStores = new Set<StoreApi<any>>();
    for (const store of failedMutation.storePatches.keys()) {
      allStores.add(store);
    }

    const remaining = this.queue
      .filter((m) => m.id !== failedMutation.id && m.status !== "failed")
      .sort((a, b) => b.timestamp - a.timestamp);

    for (const m of remaining) {
      for (const store of m.storePatches.keys()) {
        allStores.add(store);
      }
    }

    for (const store of allStores) {
      let state = store.getState();

      for (const m of remaining) {
        const entry = m.storePatches.get(store);
        if (entry) {
          state = applyPatches(state, entry.inversePatches);
        }
      }

      const failedEntry = failedMutation.storePatches.get(store);
      if (failedEntry) {
        state = applyPatches(state, failedEntry.inversePatches);
      }

      for (const m of [...remaining].reverse()) {
        const entry = m.storePatches.get(store);
        if (!entry) continue;
        try {
          state = applyPatches(state, entry.patches);
        } catch {
          m.status = "failed";
          this.inflightIds.delete(m.id);
          this.addToHistory({ ...toSnapshot(m), status: "rolled-back" });
          this.options.onMutationError(
            toSnapshot(m),
            new Error("Rebase failed: dependent mutation rolled back")
          );
        }
      }

      store.setState(state);
    }

    this.queue = this.queue.filter((m) => m.status !== "failed");
    this.notify();
  }

  clear(): void {
    this.queue = [];
    this.history = [];
    this.inflightIds.clear();
    this.notify();
  }
}

// ============================================================
// Transaction
// ============================================================

interface SetRecord {
  store: StoreApi<any>;
  patches: Patch[];
  inversePatches: Patch[];
  flushed: boolean;
}

let mutationIdCounter = 0;

/**
 * D = default store state 类型.
 * tx.set(recipe) 时 draft 类型为 Draft<D>.
 * tx.set(store, recipe) 时 draft 类型从 store 推断.
 */
export class Transaction<D extends object = any> {
  private records: SetRecord[] = [];
  private workingStates = new Map<StoreApi<any>, any>();
  private _mutation: RemoteFn | null = null;
  private _committed = false;
  private defaultStore: StoreApi<D> | null;

  /** @internal */
  constructor(
    private readonly name: string,
    private readonly enqueueFn: (mutation: Mutation) => void,
    private readonly maxRetries: number,
    defaultStore?: StoreApi<D>
  ) {
    this.defaultStore = defaultStore ?? null;
  }

  // --- set overloads ---

  /** 操作默认 store, draft 类型为 D */
  set(recipe: Recipe<D>): void;
  /** 操作指定 store, draft 类型从 store 推断 */
  set<S extends object>(store: StoreApi<S>, recipe: Recipe<S>): void;
  /** 操作指定 store, 带 options */
  set<S extends object>(
    store: StoreApi<S>,
    recipe: Recipe<S>,
    options: SetOptions
  ): void;
  set<S extends object>(
    storeOrRecipe: StoreApi<S> | Recipe<D>,
    recipeOrUndefined?: Recipe<S>,
    maybeOptions?: SetOptions
  ): void {
    let store: StoreApi<any>;
    let recipe: Recipe<any>;
    let options: SetOptions = {};

    if (typeof storeOrRecipe === "function") {
      if (!this.defaultStore) {
        throw new Error(
          `[Transaction] "${this.name}": no default store. Use tx.set(store, recipe) or pass defaultStore to createTransaction.`
        );
      }
      store = this.defaultStore;
      recipe = storeOrRecipe as Recipe<any>;
    } else {
      store = storeOrRecipe;
      recipe = recipeOrUndefined as Recipe<any>;
      options = maybeOptions ?? {};
    }

    if (this._committed) {
      throw new Error(
        `[Transaction] "${this.name}": cannot set() after commit()`
      );
    }

    const flush = options.flush ?? true;

    const baseState = this.workingStates.has(store)
      ? this.workingStates.get(store)
      : store.getState();

    const [nextState, patches, inversePatches] = produceWithPatches(
      baseState,
      recipe
    );

    if (patches.length === 0) return;

    if (flush) {
      store.setState(nextState);
      this.workingStates.delete(store);
    } else {
      this.workingStates.set(store, nextState);
    }

    this.records.push({ store, patches, inversePatches, flushed: flush });
  }

  set mutation(fn: RemoteFn) {
    this._mutation = fn;
  }

  commit(): void {
    if (this._committed) {
      console.warn(`[Transaction] "${this.name}" already committed`);
      return;
    }
    if (this.records.length === 0) {
      throw new Error(
        `[Transaction] "${this.name}": no .set() calls before .commit()`
      );
    }
    if (!this._mutation) {
      throw new Error(
        `[Transaction] "${this.name}": missing .mutation before .commit()`
      );
    }

    this._committed = true;

    // flush 所有未 flush 的 set
    for (const record of this.records) {
      if (!record.flushed) {
        const current = record.store.getState();
        const next = applyPatches(current, record.patches);
        record.store.setState(next);
        record.flushed = true;
      }
    }
    this.workingStates.clear();

    // 按 store 合并 patches
    const storePatches = new Map<StoreApi<any>, StorePatchEntry>();

    for (const record of this.records) {
      const existing = storePatches.get(record.store);
      if (existing) {
        existing.patches.push(...record.patches);
        existing.inversePatches.push(...record.inversePatches);
      } else {
        storePatches.set(record.store, {
          patches: [...record.patches],
          inversePatches: [...record.inversePatches],
        });
      }
    }

    const allAffectedPaths: string[] = [];
    for (const [, entry] of storePatches) {
      allAffectedPaths.push(...extractAffectedPaths(entry.patches));
    }

    const mutation: Mutation = {
      id: `m_${++mutationIdCounter}_${Date.now()}`,
      timestamp: Date.now(),
      status: "pending",
      storePatches,
      affectedPaths: allAffectedPaths,
      remoteFn: this._mutation,
      retryCount: 0,
      maxRetries: this.maxRetries,
      actionName: this.name,
    };

    this.enqueueFn(mutation);
  }
}

// ============================================================
// Engine
// ============================================================

export function createOptimisticEngine(
  options: OptimisticEngineOptions = {}
) {
  const queue = new MutationQueue(options);
  const maxRetries = options.maxRetries ?? 0;

  return {
    /**
     * createTransaction('name')          → Transaction<any>, 必须 tx.set(store, fn)
     * createTransaction('name', store)   → Transaction<S>,   可以 tx.set(fn) 操作默认 store
     */
    createTransaction<S extends object>(
      name: string,
      defaultStore?: StoreApi<S>
    ): Transaction<S> {
      return new Transaction<S>(
        name,
        (m) => queue.enqueue(m),
        maxRetries,
        defaultStore
      );
    },

    get queue() {
      return queue;
    },
  };
}
