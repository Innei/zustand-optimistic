/**
 * Mock API - 可控制延迟和失败率
 *
 * 通过全局配置来调节行为, 方便在 demo 中实时调整
 */

export const apiConfig = {
  /** 基础延迟 (ms) */
  baseDelay: 1500,
  /** 失败率 (0-1) */
  failureRate: 0.3,
};

function delay() {
  // 随机部分按 baseDelay 的 30% 浮动, 而不是固定值
  const jitter = apiConfig.baseDelay * 0.3 * Math.random();
  return new Promise((resolve) =>
    setTimeout(resolve, apiConfig.baseDelay + jitter)
  );
}

function maybeThrow(operation: string) {
  if (Math.random() < apiConfig.failureRate) {
    throw new Error(`[Mock API] ${operation} failed (simulated network error)`);
  }
}

export const api = {
  updateTask: async (id: string, data: Record<string, unknown>) => {
    await delay();
    maybeThrow(`updateTask(${id})`);
    console.log(`[Mock API] updateTask(${id})`, data);
    return { ok: true };
  },

  moveTask: async (id: string, status: string) => {
    await delay();
    maybeThrow(`moveTask(${id} → ${status})`);
    console.log(`[Mock API] moveTask(${id} → ${status})`);
    return { ok: true };
  },

  deleteTask: async (id: string) => {
    await delay();
    maybeThrow(`deleteTask(${id})`);
    console.log(`[Mock API] deleteTask(${id})`);
    return { ok: true };
  },

  createTask: async (
    data: Record<string, unknown>
  ): Promise<{ id: string }> => {
    await delay();
    maybeThrow("createTask");
    const id = `server_${Date.now()}`;
    console.log(`[Mock API] createTask → ${id}`, data);
    return { id };
  },
};
