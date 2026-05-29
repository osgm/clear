import {
  endBackgroundTask,
  startBackgroundTask,
  updateBackgroundTask
} from "./background-tasks.js";
import { resolveCategoryKey } from "./cdisk-catalog.js";
import { openCDiskDetail } from "./cdisk-detail.js";
import { renderCDiskResults } from "./cdisk-render.js";

const CDISK_BG_CLEANUP = "cdisk-cleanup";
function cdiskBgScanId(taskId) {
  return `cdisk-scan:${taskId}`;
}

export function initCDiskModule({
  api,
  state,
  setStatus,
  getCleanupMode,
  scanProgress,
  progressText,
  cancelScanBtn,
  pauseScanBtn,
  resumeScanBtn,
  scanBtn,
  summaryText
}) {
  const MB = 1024 * 1024;
  const CLEANUP_BATCH_SIZE = 20;
  let currentScanTaskId = null;
  let realtimeSeenPaths = new Set();
  let pendingRealtimeItems = [];
  let realtimeFlushTimer = null;
  const scanTaskState = {
    paused: false,
    pendingProgress: null
  };
  const cleanupTaskState = {
    stopRequested: false,
    taskId: null
  };
  const stopCleanupBtn = document.getElementById("stopCleanupBtn");
  const cdiskResults = document.getElementById("cdiskResults");
  const rootPathInput = document.getElementById("rootPath");
  const driveRadioGroup = document.getElementById("driveRadioGroup");

  if (!state.ignoredCategoryKeys) {
    state.ignoredCategoryKeys = new Set();
  }

  cancelScanBtn.disabled = true;
  if (pauseScanBtn) pauseScanBtn.disabled = true;
  if (resumeScanBtn) resumeScanBtn.disabled = true;
  if (stopCleanupBtn) stopCleanupBtn.disabled = true;

  function bytesToMB(bytes) {
    return (bytes / MB).toFixed(2);
  }

  function getSelectedRootPath() {
    const checked = driveRadioGroup?.querySelector('input[name="scanDrive"]:checked');
    if (checked instanceof HTMLInputElement) return checked.value;
    return rootPathInput?.value?.trim() || "C:\\";
  }

  function syncRootPathInput(value) {
    if (rootPathInput) rootPathInput.value = value;
  }

  function isJunkIgnored(junk) {
    const key = resolveCategoryKey(junk.category || "");
    return Boolean(key && state.ignoredCategoryKeys.has(key));
  }

  function visibleJunks() {
    return state.scannedJunks.filter((j) => !isJunkIgnored(j));
  }

  function sumUniqueJunkBytes(junks) {
    const seen = new Set();
    let sum = 0;
    for (const j of junks) {
      if (seen.has(j.path)) continue;
      seen.add(j.path);
      sum += j.size || 0;
    }
    return sum;
  }

  function refreshResultsView() {
    renderCDiskResults(cdiskResults, {
      state,
      onToggleCategory: (_key, paths, selected) => {
        paths.forEach((p) => (selected ? state.selectedPaths.add(p) : state.selectedPaths.delete(p)));
        refreshResultsView();
        updateQueueSummaryText();
      },
      onIgnoreCategory: (key) => {
        state.ignoredCategoryKeys.add(key);
        const paths = state.scannedJunks
          .filter((j) => resolveCategoryKey(j.category || "") === key)
          .map((j) => j.path);
        paths.forEach((p) => state.selectedPaths.delete(p));
        refreshResultsView();
        updateQueueSummaryText();
      },
      onSectionSelectAll: (items, selected) => {
        items.forEach(({ paths }) => {
          paths.forEach((p) => (selected ? state.selectedPaths.add(p) : state.selectedPaths.delete(p)));
        });
        refreshResultsView();
        updateQueueSummaryText();
      },
      onViewDetail: (payload) => {
        const paths = payload.junks.map((j) => j.path).filter(Boolean);
        openCDiskDetail({
          sectionTitle: payload.sectionTitle,
          label: payload.label,
          virtual: payload.virtual,
          sizeBytes: payload.sizeBytes,
          junks: payload.junks,
          selectedPaths: state.selectedPaths,
          onTogglePath: (filePath, selected) => {
            if (selected) state.selectedPaths.add(filePath);
            else state.selectedPaths.delete(filePath);
            refreshResultsView();
            updateQueueSummaryText();
          },
          onSelectAll: () => {
            paths.forEach((p) => state.selectedPaths.add(p));
            refreshResultsView();
            updateQueueSummaryText();
          },
          onSelectNone: () => {
            paths.forEach((p) => state.selectedPaths.delete(p));
            refreshResultsView();
            updateQueueSummaryText();
          }
        });
      }
    });
  }

  function setProgress(percent, text = "") {
    scanProgress.value = percent;
    progressText.textContent = text || `${percent}%`;
  }

  function updateSummary(scannedCount, totalBytes, skippedCount, restorePointBytes) {
    const restoreText =
      typeof restorePointBytes === "number" ? ` | 还原点占用: ${bytesToMB(restorePointBytes)} MB` : "";
    const queueText = ` | 删除队列: 待删 ${state.queuedCleanupPaths.size} | 已处理 ${state.queueProcessed}/${state.queueRequested} | 成功 ${state.queueSucceeded} | 失败 ${state.queueFailed}`;
    const visible = visibleJunks();
    summaryText.textContent = `扫描: ${scannedCount} | 命中: ${visible.length} | 预计释放: ${bytesToMB(totalBytes)} MB | 跳过路径: ${skippedCount}${restoreText}${queueText}`;
  }

  function updateQueueSummaryText() {
    const pending = state.queuedCleanupPaths.size;
    const visible = visibleJunks();
    const remainingBytes = sumUniqueJunkBytes(visible);
    const selectedBytes = sumUniqueJunkBytes(visible.filter((x) => state.selectedPaths.has(x.path)));
    const queueText = `删除队列: 待删 ${pending} | 已处理 ${state.queueProcessed}/${state.queueRequested} | 成功 ${state.queueSucceeded} | 失败 ${state.queueFailed}`;
    if (currentScanTaskId) {
      summaryText.textContent = `扫描中 | 命中: ${visible.length} | 已选: ${bytesToMB(selectedBytes)} MB | 预计释放: ${bytesToMB(remainingBytes)} MB | ${queueText}`;
      return;
    }
    const scanResult = state.lastScanPayload?.scanResult;
    const scannedCount = scanResult?.scannedCount ?? 0;
    const skippedCount = scanResult?.skippedPaths?.length ?? 0;
    const restoreText =
      typeof scanResult?.restorePointBytes === "number"
        ? ` | 还原点占用: ${bytesToMB(scanResult.restorePointBytes)} MB`
        : "";
    summaryText.textContent = `扫描: ${scannedCount} | 命中: ${visible.length} | 已选: ${bytesToMB(selectedBytes)} MB | 预计释放: ${bytesToMB(remainingBytes)} MB | 跳过路径: ${skippedCount}${restoreText} | ${queueText}`;
  }

  async function processCleanupQueue() {
    if (state.queueRunning) return;
    state.queueRunning = true;
    cleanupTaskState.stopRequested = false;
    cleanupTaskState.taskId = `cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (stopCleanupBtn) stopCleanupBtn.disabled = false;
    startBackgroundTask(CDISK_BG_CLEANUP, {
      panelId: "panel-cdisk",
      label: "磁盘清理删除",
      percent: 0,
      detail: `待处理 ${state.queuedCleanupPaths.size} 项`
    });
    try {
      while (state.queuedCleanupPaths.size > 0) {
        if (cleanupTaskState.stopRequested) break;
        const targets = state.scannedJunks.filter((x) => state.queuedCleanupPaths.has(x.path));
        if (targets.length === 0) {
          state.queuedCleanupPaths.clear();
          updateQueueSummaryText();
          break;
        }
        for (let i = 0; i < targets.length; i += CLEANUP_BATCH_SIZE) {
          if (cleanupTaskState.stopRequested) break;
          const batch = targets.slice(i, i + CLEANUP_BATCH_SIZE);
          if (batch.length === 0) continue;
          setStatus(
            `清理队列处理中... 本批 ${batch.length} 项（已处理 ${state.queueProcessed}/${state.queueRequested}）`
          );
          updateBackgroundTask(CDISK_BG_CLEANUP, {
            percent:
              state.queueRequested > 0
                ? Math.min(99, Math.round((state.queueProcessed / state.queueRequested) * 100))
                : 0,
            detail: `已处理 ${state.queueProcessed}/${state.queueRequested}`
          });
          try {
            const result = await api.cleanup(batch, getCleanupMode(), cleanupTaskState.taskId);
            if (result?.cancelled) {
              cleanupTaskState.stopRequested = true;
              break;
            }
            state.lastCleanupResult = result;
            const failedSet = new Set(result.failures.map((x) => x.path));
            const successSet = new Set(batch.map((x) => x.path).filter((p) => !failedSet.has(p)));
            successSet.forEach((p) => {
              state.cleanedPaths.add(p);
              state.selectedPaths.delete(p);
              state.queuedCleanupPaths.delete(p);
            });
            failedSet.forEach((p) => state.queuedCleanupPaths.delete(p));
            state.queueProcessed += batch.length;
            state.queueSucceeded += result.deletedCount;
            state.queueFailed += result.failedCount;
            state.scannedJunks = state.scannedJunks.filter((x) => !successSet.has(x.path));
            refreshResultsView();
            updateQueueSummaryText();
            if (result.failedCount > 0) {
              setStatus(`清理队列处理中... 本批跳过失败项 ${result.failedCount} 个`);
            }
          } catch {
            batch.forEach((item) => {
              state.queuedCleanupPaths.delete(item.path);
            });
            state.queueProcessed += batch.length;
            state.queueFailed += batch.length;
            updateQueueSummaryText();
            setStatus("清理队列处理中... 本批异常已跳过并继续");
          }
        }
      }
    } catch {
      setStatus("清理队列失败");
    } finally {
      state.queueRunning = false;
      endBackgroundTask(CDISK_BG_CLEANUP);
      if (stopCleanupBtn) stopCleanupBtn.disabled = true;
      if (!currentScanTaskId) {
        setStatus(cleanupTaskState.stopRequested ? "已停止删除任务" : "清理完成");
      }
      cleanupTaskState.stopRequested = false;
      refreshResultsView();
    }
  }

  function getCommonOptions(rootPath, bigFileThreshold, overrides = {}) {
    const includeExtensions = document.getElementById("exts").value.split(",").map((x) => x.trim()).filter(Boolean);
    const ignoreDirKeywords = document.getElementById("ignoreDirs").value.split(",").map((x) => x.trim()).filter(Boolean);
    return {
      rootPath,
      minBigFileSizeMB: bigFileThreshold,
      oldFileDays: Number(document.getElementById("oldDays").value) || 180,
      includeExtensions,
      ignoreDirKeywords,
      ...overrides
    };
  }

  function defaultSelectSafeJunks() {
    state.selectedPaths.clear();
    state.scannedJunks.forEach((x) => {
      if (isJunkIgnored(x)) return;
      if ((x.riskLevel || "safe") === "safe") state.selectedPaths.add(x.path);
    });
  }

  async function doScan(mode, options) {
    setStatus("扫描中...");
    setProgress(0, "0%");
    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    currentScanTaskId = taskId;
    scanTaskState.paused = false;
    scanTaskState.pendingProgress = null;
    realtimeSeenPaths = new Set();
    pendingRealtimeItems = [];
    if (realtimeFlushTimer) {
      clearTimeout(realtimeFlushTimer);
      realtimeFlushTimer = null;
    }
    state.scannedJunks = [];
    state.selectedPaths.clear();
    state.cleanedPaths.clear();
    state.queuedCleanupPaths.clear();
    state.ignoredCategoryKeys.clear();
    state.queueRequested = 0;
    state.queueProcessed = 0;
    state.queueSucceeded = 0;
    state.queueFailed = 0;
    refreshResultsView();
    updateSummary(0, 0, 0);
    cancelScanBtn.disabled = false;
    if (pauseScanBtn) pauseScanBtn.disabled = false;
    if (resumeScanBtn) resumeScanBtn.disabled = false;
    scanBtn.disabled = true;
    const driveLabel = options.rootPath?.replace(/\\$/, "") || "磁盘";
    startBackgroundTask(cdiskBgScanId(taskId), {
      panelId: "panel-cdisk",
      label: "磁盘清理扫描",
      percent: 0,
      detail: driveLabel
    });
    let result;
    try {
      result = await api.scan(options, taskId);
    } finally {
      endBackgroundTask(cdiskBgScanId(taskId));
    }
    if (currentScanTaskId !== taskId) return result;
    state.lastMode = mode;
    state.scannedJunks = result.junkFiles.filter((x) => !state.cleanedPaths.has(x.path));
    realtimeSeenPaths = new Set(result.junkFiles.map((x) => x.path));
    defaultSelectSafeJunks();
    state.lastCleanupResult = null;
    state.lastScanPayload = {
      createdAt: new Date().toISOString(),
      rootPath: options.rootPath,
      options,
      scanResult: result
    };
    refreshResultsView();
    updateSummary(
      result.scannedCount,
      sumUniqueJunkBytes(visibleJunks()),
      result.skippedPaths.length,
      result.restorePointBytes
    );
    setStatus("扫描完成");
    setProgress(100, "100%");
    currentScanTaskId = null;
    cancelScanBtn.disabled = true;
    if (pauseScanBtn) pauseScanBtn.disabled = true;
    if (resumeScanBtn) resumeScanBtn.disabled = true;
    scanBtn.disabled = false;
    return result;
  }

  async function initDriveRadios() {
    if (!driveRadioGroup) return;
    try {
      const { drives, defaultDrive } = await api.listDrives();
      driveRadioGroup.innerHTML = "";
      const list = drives?.length ? drives : ["C:\\"];
      const selected = defaultDrive || list[0];
      list.forEach((drive) => {
        const label = document.createElement("label");
        label.className = "cdisk-drive-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "scanDrive";
        input.value = drive.endsWith("\\") ? drive : `${drive}\\`;
        input.checked = input.value.toUpperCase() === selected.toUpperCase();
        const text = document.createElement("span");
        text.textContent = input.value.replace(/\\$/, "");
        label.appendChild(input);
        label.appendChild(text);
        driveRadioGroup.appendChild(label);
      });
      syncRootPathInput(getSelectedRootPath());
      if (!driveRadioGroup.dataset.bound) {
        driveRadioGroup.dataset.bound = "1";
        driveRadioGroup.addEventListener("change", () => {
          syncRootPathInput(getSelectedRootPath());
        });
      }
    } catch {
      driveRadioGroup.innerHTML = "";
      const label = document.createElement("label");
      label.className = "cdisk-drive-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "scanDrive";
      input.value = "C:\\";
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode("C:"));
      driveRadioGroup.appendChild(label);
      syncRootPathInput("C:\\");
    }
  }

  void initDriveRadios();
  refreshResultsView();

  document.getElementById("scanBtn").addEventListener("click", async () => {
    const root = getSelectedRootPath();
    if (!root) return alert("请先选择扫描磁盘");
    syncRootPathInput(root);
    try {
      await doScan(
        "c-disk",
        getCommonOptions(root, Number(document.getElementById("bigFileMB").value) || 200, { scanProfile: "c-disk" })
      );
    } catch (error) {
      const message = error?.message || String(error);
      const cancelled = message.includes("SCAN_CANCELLED");
      setStatus(cancelled ? "扫描已取消" : "扫描失败");
      setProgress(0, cancelled ? "已取消" : "0%");
      currentScanTaskId = null;
      cancelScanBtn.disabled = true;
      if (pauseScanBtn) pauseScanBtn.disabled = true;
      if (resumeScanBtn) resumeScanBtn.disabled = true;
      scanBtn.disabled = false;
      if (!cancelled) alert(`扫描失败: ${message}`);
    }
  });

  pauseScanBtn?.addEventListener("click", async () => {
    if (!currentScanTaskId) return;
    scanTaskState.paused = true;
    if (pauseScanBtn) pauseScanBtn.disabled = true;
    if (resumeScanBtn) resumeScanBtn.disabled = false;
    try {
      await api.pauseScan(currentScanTaskId);
    } catch {
      /* 主进程暂停失败时仍保持 UI 暂停 */
    }
    setStatus("扫描任务已暂停（后台已停止读盘）");
  });

  resumeScanBtn?.addEventListener("click", async () => {
    if (!currentScanTaskId) return;
    try {
      await api.resumeScan(currentScanTaskId);
    } catch {
      /* ignore */
    }
    scanTaskState.paused = false;
    if (pauseScanBtn) pauseScanBtn.disabled = false;
    if (resumeScanBtn) resumeScanBtn.disabled = true;
    if (scanTaskState.pendingProgress) {
      const p = scanTaskState.pendingProgress;
      setProgress(p.percent, `${p.percent}%`);
      if (p.stage === "walking") setStatus(`扫描中... 已扫描 ${p.scannedCount} 个文件`);
      else if (p.stage === "done") setStatus("扫描完成");
      scanTaskState.pendingProgress = null;
    } else {
      setStatus("扫描任务已继续");
    }
    if (pendingRealtimeItems.length > 0) {
      pendingRealtimeItems.forEach((item) => {
        if (!item?.path || state.cleanedPaths.has(item.path)) return;
        if (!state.scannedJunks.some((x) => x.path === item.path)) {
          state.scannedJunks.push(item);
        }
        if (!isJunkIgnored(item) && (item.riskLevel || "safe") === "safe") {
          state.selectedPaths.add(item.path);
        }
      });
      pendingRealtimeItems = [];
      refreshResultsView();
      updateQueueSummaryText();
    }
  });

  cancelScanBtn.addEventListener("click", async () => {
    if (!currentScanTaskId) return;
    try {
      scanTaskState.paused = false;
      if (pauseScanBtn) pauseScanBtn.disabled = true;
      if (resumeScanBtn) resumeScanBtn.disabled = true;
      await api.cancelScan(currentScanTaskId);
      setStatus("已请求停止扫描");
      setProgress(scanProgress.value, "取消中...");
    } catch (error) {
      alert(`取消扫描失败: ${error?.message || error}`);
    }
  });

  const unbindScanProgress = api.onScanProgress((payload) => {
    if (payload.taskId !== currentScanTaskId) return;
    if (scanTaskState.paused) {
      scanTaskState.pendingProgress = payload;
      return;
    }
    setProgress(payload.percent, `${payload.percent}%`);
    updateBackgroundTask(cdiskBgScanId(currentScanTaskId), {
      percent: payload.percent,
      detail:
        payload.stage === "walking"
          ? `已扫描 ${payload.scannedCount} 个文件`
          : payload.stage === "done"
            ? "即将完成"
            : ""
    });
    if (payload.stage === "walking") setStatus(`扫描中... 已扫描 ${payload.scannedCount} 个文件`);
    else if (payload.stage === "done") setStatus("扫描完成");
  });

  const unbindScanJunkBatch = api.onScanJunkBatch((payload) => {
    if (payload.taskId !== currentScanTaskId) return;
    let added = false;
    payload.items.forEach((item) => {
      if (realtimeSeenPaths.has(item.path) || state.cleanedPaths.has(item.path)) return;
      realtimeSeenPaths.add(item.path);
      if (!scanTaskState.paused) {
        state.scannedJunks.push(item);
        if (!isJunkIgnored(item) && (item.riskLevel || "safe") === "safe") {
          state.selectedPaths.add(item.path);
        }
      }
      pendingRealtimeItems.push(item);
      added = true;
    });
    if (added) {
      if (scanTaskState.paused) return;
      if (!realtimeFlushTimer) {
        realtimeFlushTimer = setTimeout(() => {
          if (scanTaskState.paused) {
            realtimeFlushTimer = null;
            return;
          }
          pendingRealtimeItems = [];
          realtimeFlushTimer = null;
          refreshResultsView();
        }, 120);
      }
      updateQueueSummaryText();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (realtimeFlushTimer) clearTimeout(realtimeFlushTimer);
    unbindScanProgress();
    unbindScanJunkBatch();
  });

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    visibleJunks().forEach((x) => state.selectedPaths.add(x.path));
    refreshResultsView();
    updateQueueSummaryText();
  });

  document.getElementById("cleanupBtn").addEventListener("click", async () => {
    if (currentScanTaskId) {
      return alert("扫描尚未完成，请等待扫描结束后再删除，以免文件列表变化导致误删。");
    }
    const targets = visibleJunks().filter((x) => state.selectedPaths.has(x.path));
    if (targets.length === 0) return alert("请先选择要清理的分类或文件");
    const mode = getCleanupMode();
    const warn =
      mode === "shred"
        ? `将对 ${targets.length} 个文件执行安全删除（覆写后不可恢复），是否继续？`
        : `将 ${targets.length} 个文件移入回收站，是否继续？`;
    if (!confirm(warn)) return;
    const before = state.queuedCleanupPaths.size;
    targets.forEach((x) => state.queuedCleanupPaths.add(x.path));
    state.queueRequested += Math.max(0, state.queuedCleanupPaths.size - before);
    updateQueueSummaryText();
    await processCleanupQueue();
  });

  stopCleanupBtn?.addEventListener("click", async () => {
    if (!state.queueRunning) return;
    cleanupTaskState.stopRequested = true;
    setStatus("已请求停止删除...");
    stopCleanupBtn.disabled = true;
    if (cleanupTaskState.taskId) {
      try {
        await api.cancelCleanup(cleanupTaskState.taskId);
      } catch {
        /* ignore */
      }
    }
  });

  document.getElementById("exportReportBtn").addEventListener("click", async () => {
    if (!state.lastScanPayload) return alert("请先执行一次扫描");
    const payload = { ...state.lastScanPayload, cleanupResult: state.lastCleanupResult ?? undefined };
    try {
      const result = await api.saveReport(payload);
      if (result.saved) alert(`已导出报告：${result.filePath}`);
    } catch (error) {
      alert(`导出失败: ${error?.message || error}`);
    }
  });
}
