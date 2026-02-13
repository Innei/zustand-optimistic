/**
 * Zustand Optimistic Update Engine
 *
 * 利用 immer 的 produceWithPatches 实现:
 * 1. 捕获精确的 patches + inversePatches
 * 2. 立即 apply 到 state (乐观更新)
 * 3. 异步执行远程操作
 * 4. 失败时通过 inversePatches 回滚 + rebase 后续 mutations
 */

import {
  type Draft,
  produceWithPatches,
  applyPatches,
  enablePatches,
  type Patch,
} from 'immer'
import type { StoreApi } from 'zustand'

enablePatches()

// ============================================================
// Types
// ============================================================

export type MutationStatus =
  | 'pending'
  | 'inflight'
  | 'success'
  | 'failed'
  | 'rolled-back'

export interface Mutation {
  id: string
  timestamp: number
  status: MutationStatus

  patches: Patch[]
  inversePatches: Patch[]
  affectedPaths: string[]

  remoteFn: () => Promise<void>

  retryCount: number
  maxRetries: number

  actionName?: string
}

export interface OptimisticEngineOptions {
  maxRetries?: number
  onMutationError?: (mutation: Mutation, error: unknown) => void
  onMutationSuccess?: (mutation: Mutation) => void
  /** 当 queue 状态变化时触发 (用于 React 订阅) */
  onQueueChange?: (mutations: Mutation[]) => void
}

type Recipe<S> = (draft: Draft<S>) => void
type RemoteFn = () => Promise<void>

// ============================================================
// Path Utilities
// ============================================================

/**
 * 从 immer patches 中提取受影响的实体级路径
 *
 * ['items', '123', 'title'] → 'items.123'
 * ['folders', 'f1', 'itemIds', '0'] → 'folders.f1'
 */
export function extractAffectedPaths(patches: Patch[]): string[] {
  const paths = new Set<string>()
  for (const patch of patches) {
    const depth = Math.min(patch.path.length, 2)
    const entityPath = patch.path.slice(0, depth).join('.')
    paths.add(entityPath)
  }
  return Array.from(paths)
}

/**
 * 路径冲突检测 (包括父子关系)
 */
export function hasPathConflict(pathsA: string[], pathsB: string[]): boolean {
  for (const a of pathsA) {
    for (const b of pathsB) {
      if (a === b || a.startsWith(b + '.') || b.startsWith(a + '.')) {
        return true
      }
    }
  }
  return false
}

// ============================================================
// Mutation Queue
// ============================================================

export class MutationQueue<S extends object> {
  private queue: Mutation[] = []
  private store: StoreApi<S>
  private options: Required<OptimisticEngineOptions>

  /** 历史记录 (用于 UI 展示已完成/失败的 mutations) */
  private history: Mutation[] = []
  private maxHistory = 20

  constructor(store: StoreApi<S>, options: OptimisticEngineOptions = {}) {
    this.store = store
    this.options = {
      maxRetries: options.maxRetries ?? 2,
      onMutationError: options.onMutationError ?? (() => {}),
      onMutationSuccess: options.onMutationSuccess ?? (() => {}),
      onQueueChange: options.onQueueChange ?? (() => {}),
    }
  }

  get mutations(): readonly Mutation[] {
    return this.queue
  }

  /** 包含历史记录的完整列表 */
  get allMutations(): readonly Mutation[] {
    return [...this.queue, ...this.history]
  }

  get hasPending(): boolean {
    return this.queue.some(
      (m) => m.status === 'pending' || m.status === 'inflight',
    )
  }

  private notify() {
    // 必须发送深拷贝: queue 中的 mutation 对象是可变的工作状态,
    // 但 onQueueChange 回调可能将它们写入 immer store, immer 会 freeze 它们,
    // 导致后续 mutation.status = "inflight" 写入 frozen 对象报错
    const snapshot = [...this.queue, ...this.history].map((m) => ({ ...m }))
    this.options.onQueueChange(snapshot)
  }

  private addToHistory(mutation: Mutation) {
    this.history.unshift(mutation)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory)
    }
  }

  enqueue(mutation: Mutation): void {
    this.queue.push(mutation)
    this.notify()
    this.processNext()
  }

  /**
   * 调度: 每个 mutation 独立执行, 不互相阻塞
   *
   * inflight 的 mutation id 集合用于防止重复调度
   */
  private inflightIds = new Set<string>()

  private processNext(): void {
    const pending = this.queue.filter(
      (m) => m.status === 'pending' && !this.inflightIds.has(m.id),
    )

    for (const mutation of pending) {
      this.executeMutation(mutation)
    }
  }

  private async executeMutation(mutation: Mutation): Promise<void> {
    this.inflightIds.add(mutation.id)
    mutation.status = 'inflight'
    this.notify()

    try {
      await mutation.remoteFn()

      // 成功
      mutation.status = 'success'
      this.inflightIds.delete(mutation.id)
      this.addToHistory({ ...mutation })
      this.queue = this.queue.filter((m) => m.id !== mutation.id)
      this.notify()
      this.options.onMutationSuccess(mutation)
    } catch (error) {
      mutation.retryCount++

      if (mutation.retryCount <= mutation.maxRetries) {
        mutation.status = 'pending'
        this.inflightIds.delete(mutation.id)
        this.notify()
        this.processNext()
        return
      }

      // 超过重试次数: 回滚
      mutation.status = 'failed'
      this.inflightIds.delete(mutation.id)
      this.notify()

      this.rollback(mutation)

      this.addToHistory({ ...mutation, status: 'rolled-back' })
      this.queue = this.queue.filter((m) => m.id !== mutation.id)
      this.notify()
      this.options.onMutationError(mutation, error)
    }
  }

  /**
   * Full Rebase 回滚策略:
   *
   * 并发模式下, queue 中可能同时有 pending 和 inflight 的 mutations,
   * 它们的 patches 都已经 apply 到了 state 上.
   *
   * 回滚步骤:
   * 1. 逆序回滚所有 remaining mutations (pending + inflight)
   * 2. 回滚失败的 mutation
   * 3. 正序重新应用 remaining mutations
   */
  private rollback(failedMutation: Mutation): void {
    const currentState = this.store.getState()

    // 收集所有还在 queue 中的 mutations (除了失败的那个), 按时间倒序
    const remaining = this.queue
      .filter((m) => m.id !== failedMutation.id && m.status !== 'failed')
      .sort((a, b) => b.timestamp - a.timestamp)

    let state = currentState

    // Step 1: 逆序回滚所有 remaining
    for (const m of remaining) {
      state = applyPatches(state, m.inversePatches)
    }

    // Step 2: 回滚失败的 mutation
    state = applyPatches(state, failedMutation.inversePatches)

    // Step 3: 正序重新应用 remaining (rebase)
    // 同时重新生成 patches (因为 base state 变了)
    for (const m of [...remaining].reverse()) {
      try {
        const rebased = applyPatches(state, m.patches)
        state = rebased
      } catch {
        // patch 无法应用 → 依赖了被回滚的数据
        m.status = 'failed'
        this.inflightIds.delete(m.id)
        this.addToHistory({ ...m, status: 'rolled-back' })
        this.options.onMutationError(
          m,
          new Error('Rebase failed: dependent mutation rolled back'),
        )
      }
    }

    // Step 4: 更新 store
    this.store.setState(state as S)

    // Step 5: 清理
    this.queue = this.queue.filter((m) => m.status !== 'failed')
    this.notify()
  }

  clear(): void {
    this.queue = []
    this.history = []
    this.inflightIds.clear()
    this.notify()
  }
}

// ============================================================
// Transaction
// ============================================================

export class Transaction<S extends object> {
  private _optimistic: Recipe<S> | null = null
  private _mutation: RemoteFn | null = null
  private _committed = false

  constructor(
    private readonly name: string,
    private readonly executor: (
      name: string,
      recipe: Recipe<S>,
      remoteFn: RemoteFn,
    ) => void,
  ) {}

  set optimistic(fn: Recipe<S>) {
    this._optimistic = fn
  }

  set mutation(fn: RemoteFn) {
    this._mutation = fn
  }

  commit(): void {
    if (this._committed) {
      if (import.meta.env?.DEV) {
        console.warn(`[Transaction] "${this.name}" already committed`)
      }
      return
    }
    if (!this._optimistic) {
      throw new Error(
        `[Transaction] "${this.name}": missing .optimistic before .commit()`,
      )
    }
    if (!this._mutation) {
      throw new Error(
        `[Transaction] "${this.name}": missing .mutation before .commit()`,
      )
    }

    this._committed = true
    this.executor(this.name, this._optimistic, this._mutation)
  }
}

// ============================================================
// Engine Factory
// ============================================================

let mutationIdCounter = 0

export function createOptimisticEngine<S extends object>(
  store: StoreApi<S>,
  options: OptimisticEngineOptions = {},
) {
  const queue = new MutationQueue<S>(store, options)
  const maxRetries = options.maxRetries ?? 2

  function execute(
    actionName: string,
    recipe: Recipe<S>,
    remoteFn: RemoteFn,
  ): void {
    const currentState = store.getState()

    const [nextState, patches, inversePatches] = produceWithPatches(
      currentState,
      recipe,
    )

    if (patches.length === 0) return

    // 立即更新 UI
    store.setState(nextState as S)

    const mutation: Mutation = {
      id: `m_${++mutationIdCounter}_${Date.now()}`,
      timestamp: Date.now(),
      status: 'pending',
      patches,
      inversePatches,
      affectedPaths: extractAffectedPaths(patches),
      remoteFn,
      retryCount: 0,
      maxRetries,
      actionName,
    }

    queue.enqueue(mutation)
  }

  return {
    createTransaction(name: string): Transaction<S> {
      return new Transaction<S>(name, execute)
    },

    get queue() {
      return queue
    },
  }
}
