import { beforeEach, describe, expect, it, vi } from "vitest";
import { engine } from "./engine";
import { taskStore, type TaskStatus } from "./task-store";
import { userStore } from "./user-store";
import { apiConfig, apiTestTools } from "../mock/api";
import { useUIStore } from "./ui-store";

const initialTasks = structuredClone(taskStore.getState().tasks);
const initialUsers = structuredClone(userStore.getState().users);

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForQueueToSettle(timeoutMs = 6000): Promise<void> {
  const start = Date.now();

  while (engine.queue.hasPending) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting optimistic queue to settle");
    }
    await sleep(10);
  }

  // ensure last notify() is visible to snapshots subscriber
  await sleep(0);
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "todo") return "doing";
  if (status === "doing") return "done";
  return "todo";
}

describe("optimistic extreme cases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    engine.queue.clear();

    taskStore.setState({ tasks: structuredClone(initialTasks) });
    userStore.setState({ users: structuredClone(initialUsers) });

    useUIStore.setState({ queueSnapshot: [], toasts: [] });

    apiConfig.baseDelay = 0;
    apiConfig.failureRate = 0;
    apiConfig.jitterRatio = 0;

    apiTestTools.clearBehaviors();
    apiTestTools.resetTaskIdMap();
  });

  it("case A: middle mutation failure triggers rollback and rebase", async () => {
    const actions = taskStore.getState();
    const baseTask = actions.tasks.task2;
    const baseStatus = baseTask.status;

    apiTestTools.enqueueBehaviors([
      { opPrefix: "updateTask", delayMs: 30, fail: false },
      { opPrefix: "moveTask", delayMs: 30, fail: true },
      { opPrefix: "moveTask", delayMs: 30, fail: true },
      { opPrefix: "updateTask", delayMs: 20, fail: false },
    ]);

    const suffix = String(Date.now()).slice(-5);
    const firstTitle = `[test-A1 ${suffix}]`;
    const finalTitle = `[test-A2 ${suffix}]`;

    actions.updateTaskTitle(baseTask.id, firstTitle);
    actions.moveTask(baseTask.id, nextStatus(baseStatus));
    actions.updateTaskTitle(baseTask.id, finalTitle);

    await waitForQueueToSettle();

    const task = taskStore.getState().tasks[baseTask.id];
    expect(task.title).toBe(finalTitle);
    expect(task.status).toBe(baseStatus);

    const snapshots = useUIStore.getState().queueSnapshot;
    expect(
      snapshots.some(
        (item) =>
          item.status === "rolled-back" &&
          item.actionName?.startsWith("moveTask(")
      )
    ).toBe(true);

    const titleSuccessCount = snapshots.filter(
      (item) =>
        item.status === "success" && item.actionName?.startsWith("updateTitle(")
    ).length;

    expect(titleSuccessCount).toBeGreaterThanOrEqual(2);
  });

  it("case B: create failure rolls back dependent mutations", async () => {
    const actions = taskStore.getState();
    const userId = Object.keys(userStore.getState().users)[0];

    apiTestTools.enqueueBehaviors([
      { opPrefix: "createTask", delayMs: 40, fail: true },
      { opPrefix: "createTask", delayMs: 40, fail: true },
    ]);

    const taskId = actions.createTask("[test-B] create fail with dependents", "todo");
    expect(taskId).not.toBe("");

    actions.moveTask(taskId, "doing");
    actions.assignTask(taskId, userId);

    await waitForQueueToSettle();

    const taskAfter = taskStore.getState().tasks[taskId];
    expect(taskAfter).toBeUndefined();

    const assignedIds = userStore.getState().users[userId].assignedTaskIds;
    expect(assignedIds.includes(taskId)).toBe(false);

    const rolledBackActions = useUIStore
      .getState()
      .queueSnapshot.filter((item) => item.status === "rolled-back")
      .map((item) => item.actionName ?? "");

    expect(rolledBackActions.some((name) => name.startsWith("createTask("))).toBe(
      true
    );
    expect(rolledBackActions.some((name) => name.startsWith("moveTask("))).toBe(
      true
    );
    expect(
      rolledBackActions.some(
        (name) =>
          name.startsWith("assignTask(") || name.startsWith("unassignTask(")
      )
    ).toBe(true);
  });

  it("case C: conflicting assign burst is serialized by path conflict", async () => {
    const actions = taskStore.getState();
    const taskId = "task1";
    const [userA, userB] = Object.keys(userStore.getState().users);

    apiTestTools.enqueueBehaviors([
      { opPrefix: "updateTask", delayMs: 120, fail: false },
      { opPrefix: "updateTask", delayMs: 40, fail: false },
      { opPrefix: "updateTask", delayMs: 10, fail: false },
    ]);

    actions.assignTask(taskId, userA);
    actions.assignTask(taskId, userB);
    actions.assignTask(taskId, null);

    await waitForQueueToSettle();

    const finalTask = taskStore.getState().tasks[taskId];
    expect(finalTask.assigneeId).toBeNull();

    expect(userStore.getState().users[userA].assignedTaskIds.includes(taskId)).toBe(
      false
    );
    expect(userStore.getState().users[userB].assignedTaskIds.includes(taskId)).toBe(
      false
    );

    const relatedSuccesses = useUIStore
      .getState()
      .queueSnapshot.filter(
        (item) =>
          item.status === "success" &&
          item.actionName?.includes(taskId) &&
          (item.actionName?.startsWith("assignTask(") ||
            item.actionName?.startsWith("unassignTask("))
      )
      .map((item) => item.actionName);

    expect(relatedSuccesses.slice(0, 3)).toEqual([
      `unassignTask(${taskId})`,
      `assignTask(${taskId} → ${userB})`,
      `assignTask(${taskId} → ${userA})`,
    ]);
  });
});
