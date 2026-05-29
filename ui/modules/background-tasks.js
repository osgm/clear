/**
 * 跨面板后台任务状态（切换主菜单不取消任务，仅切换可见面板）
 */

/** @typedef {{ id: string, panelId: string, label: string, percent?: number, detail?: string }} BackgroundTask */

/** @type {Map<string, BackgroundTask>} */
const tasks = new Map();
/** @type {Set<() => void>} */
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/**
 * @param {string} id
 * @param {{ panelId: string, label: string, percent?: number, detail?: string }} info
 */
export function startBackgroundTask(id, info) {
  tasks.set(id, {
    id,
    panelId: info.panelId,
    label: info.label,
    percent: info.percent ?? 0,
    detail: info.detail ?? ""
  });
  notify();
}

/**
 * @param {string} id
 * @param {{ percent?: number, detail?: string, label?: string }} patch
 */
export function updateBackgroundTask(id, patch) {
  const cur = tasks.get(id);
  if (!cur) return;
  tasks.set(id, { ...cur, ...patch });
  notify();
}

/** @param {string} id */
export function endBackgroundTask(id) {
  if (!tasks.delete(id)) return;
  notify();
}

/** @returns {BackgroundTask[]} */
export function listBackgroundTasks() {
  return Array.from(tasks.values());
}

/** @param {string} panelId */
export function hasBackgroundTaskForPanel(panelId) {
  return listBackgroundTasks().some((t) => t.panelId === panelId);
}

/** @param {() => void} listener */
export function subscribeBackgroundTasks(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
