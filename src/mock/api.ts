/**
 * Mock API - 可控制延迟和失败率
 *
 * 通过全局配置来调节行为, 方便在 demo 中实时调整.
 * 额外提供 deterministic hooks, 方便复现极端 case.
 */

export const apiConfig = {
  /** 基础延迟 (ms) */
  baseDelay: 1500,
  /** 失败率 (0-1) */
  failureRate: 0.3,
  /** 抖动比例, 0.3 = 基于 baseDelay 的 30% */
  jitterRatio: 0.3,
};

export interface PlannedApiBehavior {
  /** 操作名前缀, 比如 "createTask" 或 "updateTask(task_123)" */
  opPrefix?: string;
  /** 指定本次请求延迟 */
  delayMs?: number;
  /** 是否强制失败 */
  fail?: boolean;
}

const plannedBehaviors: PlannedApiBehavior[] = [];
const clientToServerTaskId = new Map<string, string>();

function popBehavior(operation: string): PlannedApiBehavior | undefined {
  const index = plannedBehaviors.findIndex(
    (item) => !item.opPrefix || operation.startsWith(item.opPrefix)
  );
  if (index < 0) return undefined;
  return plannedBehaviors.splice(index, 1)[0];
}

function randomDelayMs() {
  const jitter = apiConfig.baseDelay * apiConfig.jitterRatio * Math.random();
  return apiConfig.baseDelay + jitter;
}

async function simulate(operation: string): Promise<void> {
  const behavior = popBehavior(operation);
  const delayMs = behavior?.delayMs ?? randomDelayMs();

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  // 有显式 behavior 时, 直接按脚本执行, 不走随机失败
  if (behavior) {
    if (behavior.fail) {
      throw new Error(
        `[Mock API] ${operation} failed (forced by planned behavior)`
      );
    }
    return;
  }

  if (Math.random() < apiConfig.failureRate) {
    throw new Error(`[Mock API] ${operation} failed (simulated network error)`);
  }
}

function resolveTaskId(id: string) {
  return clientToServerTaskId.get(id) ?? id;
}

export const apiTestTools = {
  enqueueBehaviors(items: PlannedApiBehavior[]) {
    plannedBehaviors.push(...items);
  },

  forceFailNext(count = 1) {
    for (let i = 0; i < count; i++) {
      plannedBehaviors.push({ fail: true });
    }
  },

  clearBehaviors() {
    plannedBehaviors.length = 0;
  },

  resetTaskIdMap() {
    clientToServerTaskId.clear();
  },

  getMappedTaskId(id: string) {
    return clientToServerTaskId.get(id) ?? null;
  },
};

export const api = {
  updateTask: async (id: string, data: Record<string, unknown>) => {
    const remoteId = resolveTaskId(id);
    await simulate(`updateTask(${remoteId})`);
    console.log(`[Mock API] updateTask(${remoteId})`, data);
    return { ok: true };
  },

  moveTask: async (id: string, status: string) => {
    const remoteId = resolveTaskId(id);
    await simulate(`moveTask(${remoteId} → ${status})`);
    console.log(`[Mock API] moveTask(${remoteId} → ${status})`);
    return { ok: true };
  },

  deleteTask: async (id: string) => {
    const remoteId = resolveTaskId(id);
    await simulate(`deleteTask(${remoteId})`);
    console.log(`[Mock API] deleteTask(${remoteId})`);
    return { ok: true };
  },

  createTask: async (
    data: Record<string, unknown> & { id?: string }
  ): Promise<{ id: string; clientId?: string }> => {
    await simulate("createTask");

    const serverId = `server_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const clientId = typeof data.id === "string" ? data.id : undefined;

    if (clientId) {
      clientToServerTaskId.set(clientId, serverId);
    }

    console.log(`[Mock API] createTask client=${clientId ?? "<none>"} → ${serverId}`, data);
    return { id: serverId, clientId };
  },
};
