import {
  endBackgroundTask,
  startBackgroundTask,
  updateBackgroundTask
} from "./background-tasks.js";
import { createAnalyzeRenderer } from "./analyze-render.js";

function analyzeBgId(taskId) {
  return `analyze:${taskId}`;
}

const ANALYZE_TOOL_LABELS = {
  duplicates: "重复文件",
  bigfiles: "大文件",
  "empty-files": "空文件",
  "empty-dirs": "空文件夹"
};

export function initAnalyzeModule({ api, state, getCleanupMode }) {
  const analyzeDriveCheckboxGroup = document.getElementById("analyzeDriveCheckboxGroup");
  const analyzeRootPathInput = document.getElementById("analyzeRootPath");

  function getSelectedAnalyzeRoots() {
    const checked = analyzeDriveCheckboxGroup?.querySelectorAll('input[name="analyzeDrive"]:checked');
    if (checked?.length) {
      return Array.from(checked)
        .filter((el) => el instanceof HTMLInputElement)
        .map((el) => el.value);
    }
    const fallback = analyzeRootPathInput?.value?.trim();
    return fallback ? [fallback.endsWith("\\") ? fallback : `${fallback}\\`] : ["C:\\"];
  }

  function getSelectedAnalyzeTools() {
    return Array.from(document.querySelectorAll('input[name="analyzeTool"]:checked'))
      .filter((el) => el instanceof HTMLInputElement)
      .map((el) => el.value);
  }

  function syncAnalyzeRootPath(value) {
    if (analyzeRootPathInput) analyzeRootPathInput.value = value;
  }

  async function initAnalyzeDriveCheckboxes() {
    if (!analyzeDriveCheckboxGroup) return;
    try {
      const { drives, defaultDrive } = await api.listDrives();
      analyzeDriveCheckboxGroup.innerHTML = "";
      const list = drives?.length ? drives : ["C:\\"];
      const selected = defaultDrive || list[0];
      list.forEach((drive) => {
        const label = document.createElement("label");
        label.className = "cdisk-drive-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = "analyzeDrive";
        input.value = drive.endsWith("\\") ? drive : `${drive}\\`;
        input.checked = input.value.toUpperCase() === selected.toUpperCase();
        const text = document.createElement("span");
        text.textContent = input.value.replace(/\\$/, "");
        label.appendChild(input);
        label.appendChild(text);
        analyzeDriveCheckboxGroup.appendChild(label);
      });
      syncAnalyzeRootPath(getSelectedAnalyzeRoots()[0] || "C:\\");
      if (!analyzeDriveCheckboxGroup.dataset.bound) {
        analyzeDriveCheckboxGroup.dataset.bound = "1";
        analyzeDriveCheckboxGroup.addEventListener("change", () => {
          const roots = getSelectedAnalyzeRoots();
          syncAnalyzeRootPath(roots[0] || "C:\\");
        });
      }
    } catch {
      analyzeDriveCheckboxGroup.innerHTML = "";
      const label = document.createElement("label");
      label.className = "cdisk-drive-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "analyzeDrive";
      input.value = "C:\\";
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode("C:"));
      analyzeDriveCheckboxGroup.appendChild(label);
      syncAnalyzeRootPath("C:\\");
    }
  }

  void initAnalyzeDriveCheckboxes();

  const analyzeTaskState = {
    running: false,
    paused: false,
    stopRequested: false,
    pendingApply: null,
    currentTaskId: "",
    realtimeBuffer: [],
    realtimeSeen: new Set(),
    currentRunKey: ""
  };
  const analyzeProgress = document.getElementById("analyzeProgress");
  const analyzeProgressText = document.getElementById("analyzeProgressText");
  let analyzeProgressTimer = null;

  function setAnalyzeProgress(percent, text) {
    if (analyzeProgress) analyzeProgress.value = Math.max(0, Math.min(100, percent));
    if (analyzeProgressText) analyzeProgressText.textContent = text || `${Math.round(percent)}%`;
  }

  function startAnalyzeProgress() {
    if (analyzeProgressTimer) clearInterval(analyzeProgressTimer);
    setAnalyzeProgress(3, "3%");
    analyzeProgressTimer = setInterval(() => {
      if (!analyzeProgress) return;
      if (analyzeTaskState.paused) return;
      const next = Math.min(96, Number(analyzeProgress.value || 0) + 2);
      setAnalyzeProgress(next, `${Math.round(next)}%`);
    }, 350);
  }

  function finishAnalyzeProgress(ok) {
    if (analyzeProgressTimer) {
      clearInterval(analyzeProgressTimer);
      analyzeProgressTimer = null;
    }
    setAnalyzeProgress(ok ? 100 : 0, ok ? "100%" : "0%");
  }

  function applyAnalyzePending() {
    if (typeof analyzeTaskState.pendingApply === "function") {
      const fn = analyzeTaskState.pendingApply;
      analyzeTaskState.pendingApply = null;
      fn();
    }
  }

  function countAnalyzeResults() {
    const dupFiles = state.duplicateGroups.reduce((n, g) => n + g.files.length, 0);
    return dupFiles + state.analyzeItems.length;
  }

  function updateAnalyzeLiveStatus(extra = "") {
    const st = document.getElementById("analyzeStatus");
    if (!st) return;
    const n = countAnalyzeResults();
    const dupGroups = state.duplicateGroups.length;
    const parts = [`分析中`, `已发现 ${n} 项`];
    if (dupGroups > 0) parts.push(`${dupGroups} 个重复组`);
    if (extra) parts.push(extra);
    st.textContent = parts.join(" · ");
  }

  const renderer = createAnalyzeRenderer(state);
  const {
    duplicateGroupId,
    getDuplicateGroupById,
    getSelectedAnalyzeTargets,
    setPendingScrollGroupId,
    renderAnalyzeTable
  } = renderer;

  function newAnalyzeTaskId() {
    return `an-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function makeRunKey(root, tool) {
    return `${root}|${tool}`;
  }

  function tagAnalyzeItems(items, runKey, driveLabel, tool) {
    const prefix = `[${driveLabel}] ${ANALYZE_TOOL_LABELS[tool] || tool} · `;
    return items.map((f) => ({
      ...f,
      reason: f.reason?.startsWith(prefix) ? f.reason : `${prefix}${f.reason || ""}`,
      _runKey: runKey
    }));
  }

  function replaceAnalyzeItemsForRun(runKey, items, driveLabel, tool) {
    state.analyzeItems = state.analyzeItems.filter((x) => x._runKey !== runKey);
    state.analyzeItems.push(...tagAnalyzeItems(items, runKey, driveLabel, tool));
  }

  function mergeDuplicateGroups(incoming, driveLabel) {
    for (const g of incoming) {
      const dupKey = `${driveLabel}|${g.hash}:${g.size}`;
      let existing = state.duplicateGroups.find((x) => x._dupKey === dupKey);
      if (!existing) {
        state.duplicateGroups.push({
          ...g,
          _dupKey: dupKey,
          _driveLabel: driveLabel
        });
        continue;
      }
      const paths = new Set(existing.files.map((f) => f.path));
      for (const f of g.files) {
        if (!paths.has(f.path)) {
          existing.files.push(f);
          paths.add(f.path);
        }
      }
    }
  }

  let realtimeFlushTimer = null;
  function flushRealtimeRows(force = false) {
    if (analyzeTaskState.paused && !force) return;
    if (analyzeTaskState.realtimeBuffer.length === 0) return;
    const batch = analyzeTaskState.realtimeBuffer.splice(0, analyzeTaskState.realtimeBuffer.length);
    const runKey = analyzeTaskState.currentRunKey;
    const tool = analyzeTaskState.currentTool || "";
    const driveLabel = analyzeTaskState.currentDriveLabel || "";
    let changed = false;

    if (tool === "bigfiles") {
      const unique = [];
      const seen = new Set();
      for (const item of batch) {
        if (!item?.path || seen.has(item.path)) continue;
        seen.add(item.path);
        unique.push(item);
      }
      if (unique.length > 0) {
        state.analyzeItems = state.analyzeItems.filter((x) => x._runKey !== runKey);
        state.analyzeItems.push(...tagAnalyzeItems(unique, runKey, driveLabel, tool));
        changed = true;
      }
    } else {
      for (const item of batch) {
        if (!item?.path || analyzeTaskState.realtimeSeen.has(`${runKey}|${item.path}`)) continue;
        analyzeTaskState.realtimeSeen.add(`${runKey}|${item.path}`);
        state.analyzeItems.push(...tagAnalyzeItems([item], runKey, driveLabel, tool));
        changed = true;
      }
    }

    if (changed) {
      renderAnalyzeTable();
      updateAnalyzeLiveStatus();
    }
  }

  function scheduleRealtimeFlush() {
    if (realtimeFlushTimer) return;
    realtimeFlushTimer = setTimeout(() => {
      realtimeFlushTimer = null;
      flushRealtimeRows();
    }, 120);
  }

  const unbindAnalyzeProgress = api.onAnalyzeProgress?.((payload) => {
    if (!payload || payload.taskId !== analyzeTaskState.currentTaskId) return;
    if (analyzeTaskState.paused) return;
    const pct = Number(payload.percent ?? 0);
    if (payload.stage === "walking") {
      setAnalyzeProgress(pct, `${Math.max(1, Math.round(pct))}%`);
    } else if (payload.stage === "hashing") {
      setAnalyzeProgress(Math.max(65, pct), `${Math.round(Math.max(65, pct))}%`);
    } else if (payload.stage === "done") {
      setAnalyzeProgress(100, "100%");
    }
    updateBackgroundTask(analyzeBgId(analyzeTaskState.currentTaskId), {
      percent: payload.stage === "hashing" ? Math.max(65, pct) : pct,
      detail:
        typeof payload.duplicateGroupCount === "number" && payload.duplicateGroupCount > 0
          ? `重复组 ${payload.duplicateGroupCount}`
          : `已发现 ${countAnalyzeResults()} 项`
    });
    if (typeof payload.duplicateGroupCount === "number" && payload.duplicateGroupCount > 0) {
      updateAnalyzeLiveStatus(`重复组 ${payload.duplicateGroupCount}`);
    }
  });

  const unbindAnalyzeJunkBatch = api.onAnalyzeJunkBatch?.((payload) => {
    if (!payload || payload.taskId !== analyzeTaskState.currentTaskId) return;
    if (!Array.isArray(payload.items) || payload.items.length === 0) return;
    analyzeTaskState.realtimeBuffer.push(...payload.items);
    scheduleRealtimeFlush();
  });

  const unbindAnalyzeDuplicateBatch = api.onAnalyzeDuplicateBatch?.((payload) => {
    if (!payload || payload.taskId !== analyzeTaskState.currentTaskId) return;
    if (!Array.isArray(payload.groups) || payload.groups.length === 0) return;
    mergeDuplicateGroups(payload.groups, analyzeTaskState.currentDriveLabel || "");
    renderAnalyzeTable();
    updateAnalyzeLiveStatus();
  });

  function syncAnalyzeOptionRows() {
    const tools = getSelectedAnalyzeTools();
    const dupRow = document.getElementById("analyzeOptDup");
    const bigRow = document.getElementById("analyzeOptBig");
    if (dupRow) dupRow.hidden = !tools.includes("duplicates");
    if (bigRow) {
      const enabled = tools.includes("bigfiles");
      bigRow.hidden = !enabled;
      bigRow.style.opacity = enabled ? "1" : "0.6";
      bigRow.querySelectorAll("input").forEach((input) => {
        if (input instanceof HTMLInputElement) input.disabled = !enabled;
      });
    }
    const expandBtn = document.getElementById("analyzeExpandAllBtn");
    const collapseBtn = document.getElementById("analyzeCollapseAllBtn");
    const hasDup = tools.includes("duplicates");
    if (expandBtn) expandBtn.hidden = !hasDup;
    if (collapseBtn) collapseBtn.hidden = !hasDup;
  }

  document.querySelectorAll('input[name="analyzeTool"]').forEach((r) => {
    r.addEventListener("change", () => {
      syncAnalyzeOptionRows();
    });
  });
  syncAnalyzeOptionRows();

  async function runAnalyzeTool(root, tool, taskId) {
    const driveLabel = root.replace(/\\$/, "");
    const runKey = makeRunKey(root, tool);
    analyzeTaskState.currentRunKey = runKey;
    analyzeTaskState.currentDriveLabel = driveLabel;
    analyzeTaskState.currentTool = tool;
    state.analyzeTool = tool;

    const ignoreRaw = document.getElementById("analyzeIgnoreDirs")?.value ?? "";
    const ignoreDirKeywords = ignoreRaw.split(",").map((x) => x.trim()).filter(Boolean);
    updateAnalyzeLiveStatus(`${driveLabel} · ${ANALYZE_TOOL_LABELS[tool]}`);

    if (tool === "duplicates") {
      const r = await api.scanDuplicatesTask(
        {
          rootPath: root,
          ignoreDirKeywords,
          minSizeBytes: Number(document.getElementById("dupMinBytes")?.value) || 1024,
          maxFilesToHash: Number(document.getElementById("dupMaxHash")?.value) || 8000
        },
        taskId
      );
      if (analyzeTaskState.stopRequested) return;
      return () => {
        flushRealtimeRows(true);
        mergeDuplicateGroups(r.groups, driveLabel);
        if (r.truncated) {
          alert("已达到「最多哈希文件数」上限，结果可能不完整，可调大该值后重试。");
        }
      };
    }
    if (tool === "bigfiles") {
      const r = await api.scanBigFilesTask(
        {
          rootPath: root,
          ignoreDirKeywords,
          minSizeMB: Number(document.getElementById("bigMinMB")?.value) || 100,
          topN: Number(document.getElementById("bigTopN")?.value) || 30,
          includeRestorePointFiles: Boolean(document.getElementById("bigIncludeRestorePoints")?.checked)
        },
        taskId
      );
      if (analyzeTaskState.stopRequested) return;
      return () => {
        flushRealtimeRows(true);
        replaceAnalyzeItemsForRun(runKey, r.files, driveLabel, tool);
      };
    }
    const r = await api.scanEmptyItemsTask(
      {
        rootPath: root,
        ignoreDirKeywords,
        mode: tool === "empty-files" ? "empty-files" : "empty-dirs"
      },
      taskId
    );
    if (analyzeTaskState.stopRequested) return;
    return () => {
      flushRealtimeRows(true);
      replaceAnalyzeItemsForRun(runKey, r.items, driveLabel, tool);
    };
  }

  document.getElementById("analyzeScanBtn")?.addEventListener("click", async () => {
    if (analyzeTaskState.running) return;
    if (analyzeTaskState.paused) {
      const st0 = document.getElementById("analyzeStatus");
      if (st0) st0.textContent = "任务已暂停，点击继续任务";
      return;
    }

    const roots = getSelectedAnalyzeRoots();
    const tools = getSelectedAnalyzeTools();
    if (roots.length === 0) return alert("请至少选择一个要分析的磁盘");
    if (tools.length === 0) return alert("请至少选择一种分析工具");
    syncAnalyzeRootPath(roots[0]);

    const taskId = newAnalyzeTaskId();
    analyzeTaskState.currentTaskId = taskId;
    analyzeTaskState.realtimeBuffer = [];
    analyzeTaskState.realtimeSeen.clear();
    state.analyzeItems = [];
    state.duplicateGroups = [];
    state.selectedAnalyzePaths.clear();
    state.collapsedDuplicateGroups.clear();
    renderAnalyzeTable();

    const st = document.getElementById("analyzeStatus");
    if (st) st.textContent = "分析中…";
    startAnalyzeProgress();
    analyzeTaskState.running = true;
    analyzeTaskState.stopRequested = false;
    startBackgroundTask(analyzeBgId(taskId), {
      panelId: "panel-analyze",
      label: "磁盘分析",
      percent: 0,
      detail: `${roots.length} 个磁盘 · ${tools.length} 项工具`
    });

    try {
      const applyChain = [];
      for (const root of roots) {
        if (analyzeTaskState.stopRequested) break;
        for (const tool of tools) {
          if (analyzeTaskState.stopRequested) break;
          const apply = await runAnalyzeTool(root, tool, taskId);
          if (typeof apply === "function") applyChain.push(apply);
        }
      }

      if (analyzeTaskState.stopRequested) {
        if (st) st.textContent = "任务已停止";
        finishAnalyzeProgress(false);
        return;
      }

      if (analyzeTaskState.currentTaskId !== taskId) return;

      const finalApply = () => {
        for (const fn of applyChain) fn();
        state.selectedAnalyzePaths.clear();
        renderAnalyzeTable();
        const n = countAnalyzeResults();
        if (st) st.textContent = `完成 · 共 ${n} 项`;
        finishAnalyzeProgress(true);
      };

      if (analyzeTaskState.paused) {
        analyzeTaskState.pendingApply = finalApply;
        if (st) st.textContent = "任务已暂停，点击继续任务";
      } else {
        finalApply();
      }
    } catch (error) {
      if (analyzeTaskState.currentTaskId !== taskId) return;
      const msg = String(error?.message || error || "");
      if (msg.includes("SCAN_CANCELLED")) {
        if (st) st.textContent = "任务已停止";
      } else {
        if (st) st.textContent = "失败";
        alert(`分析失败: ${msg}`);
      }
      finishAnalyzeProgress(false);
    } finally {
      if (analyzeTaskState.currentTaskId === taskId) {
        analyzeTaskState.running = false;
        analyzeTaskState.stopRequested = false;
        analyzeTaskState.currentTaskId = "";
        analyzeTaskState.realtimeBuffer = [];
        analyzeTaskState.currentRunKey = "";
      }
    }
  });

  document.getElementById("analyzeBody")?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
    const p = target.dataset.path;
    if (!p) return;
    target.checked ? state.selectedAnalyzePaths.add(p) : state.selectedAnalyzePaths.delete(p);
  });
  document.getElementById("analyzeBody")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const selectBtn = target.closest("[data-group-select]");
    if (selectBtn instanceof HTMLButtonElement) {
      const group = getDuplicateGroupById(selectBtn.dataset.groupSelect || "");
      if (!group) return;
      const allSelected = group.files.every((f) => state.selectedAnalyzePaths.has(f.path));
      if (allSelected) group.files.forEach((f) => state.selectedAnalyzePaths.delete(f.path));
      else group.files.forEach((f) => state.selectedAnalyzePaths.add(f.path));
      renderAnalyzeTable();
      return;
    }
    const btn = target.closest("[data-group-toggle]");
    if (!(btn instanceof HTMLButtonElement)) return;
    const groupId = btn.dataset.groupToggle;
    if (!groupId) return;
    if (state.collapsedDuplicateGroups.has(groupId)) state.collapsedDuplicateGroups.delete(groupId);
    else state.collapsedDuplicateGroups.add(groupId);
    renderAnalyzeTable();
  });

  document.getElementById("analyzeSelectAllBtn")?.addEventListener("click", () => {
    state.duplicateGroups.forEach((g) => {
      if (state.collapsedDuplicateGroups.has(duplicateGroupId(g))) return;
      g.files.forEach((f) => state.selectedAnalyzePaths.add(f.path));
    });
    state.analyzeItems.forEach((f) => state.selectedAnalyzePaths.add(f.path));
    renderAnalyzeTable();
  });
  document.getElementById("analyzeExpandAllBtn")?.addEventListener("click", () => {
    state.collapsedDuplicateGroups.clear();
    renderAnalyzeTable();
  });
  document.getElementById("analyzeCollapseAllBtn")?.addEventListener("click", () => {
    state.collapsedDuplicateGroups = new Set(state.duplicateGroups.map((g) => duplicateGroupId(g)));
    renderAnalyzeTable();
  });

  document.getElementById("analyzeCleanupBtn")?.addEventListener("click", async () => {
    if (analyzeTaskState.running) return;
    if (analyzeTaskState.paused) {
      const st0 = document.getElementById("analyzeStatus");
      if (st0) st0.textContent = "任务已暂停，点击继续任务";
      return;
    }
    const targets = getSelectedAnalyzeTargets();
    if (targets.length === 0) return alert("请先勾选要删除的项");
    const mode = getCleanupMode();
    const warn =
      mode === "shred"
        ? `将安全删除已选 ${targets.length} 项（空目录或大文件均可能耗时，且不可恢复），是否继续？`
        : `将已选 ${targets.length} 项移入回收站，是否继续？`;
    if (!confirm(warn)) return;
    const st = document.getElementById("analyzeStatus");
    if (st) st.textContent = "删除中…";
    startAnalyzeProgress();
    analyzeTaskState.running = true;
    analyzeTaskState.stopRequested = false;
    const cleanupBgId = `analyze-cleanup:${Date.now()}`;
    startBackgroundTask(cleanupBgId, {
      panelId: "panel-analyze",
      label: "磁盘分析删除",
      detail: `${targets.length} 项`
    });
    try {
      const result = await api.cleanup(targets, mode);
      if (analyzeTaskState.stopRequested) {
        if (st) st.textContent = "任务已停止";
        finishAnalyzeProgress(false);
        return;
      }
      alert(`完成：成功 ${result.deletedCount}，失败 ${result.failedCount}`);
      const failedSet = new Set(result.failures.map((x) => x.path));
      const successSet = new Set(targets.map((x) => x.path).filter((p) => !failedSet.has(p)));
      state.selectedAnalyzePaths.forEach((p) => {
        if (successSet.has(p)) state.selectedAnalyzePaths.delete(p);
      });
      const prevGroups = state.duplicateGroups.slice();
      let firstAffectedIndex = -1;
      prevGroups.forEach((g, idx) => {
        if (firstAffectedIndex < 0 && g.files.some((f) => successSet.has(f.path))) firstAffectedIndex = idx;
      });
      state.duplicateGroups = state.duplicateGroups
        .map((g) => ({ ...g, files: g.files.filter((f) => !successSet.has(f.path)) }))
        .filter((g) => g.files.length > 0);
      if (firstAffectedIndex >= 0 && state.duplicateGroups.length > 0) {
        setPendingScrollGroupId(
          duplicateGroupId(
            state.duplicateGroups[Math.min(firstAffectedIndex, state.duplicateGroups.length - 1)]
          )
        );
      } else {
        setPendingScrollGroupId("");
      }
      state.analyzeItems = state.analyzeItems.filter((f) => !successSet.has(f.path));
      const apply = () => {
        renderAnalyzeTable();
        if (st) st.textContent = "删除完成";
        finishAnalyzeProgress(true);
      };
      if (analyzeTaskState.paused) {
        analyzeTaskState.pendingApply = apply;
        if (st) st.textContent = "任务已暂停，点击继续任务";
      } else {
        apply();
      }
    } catch (error) {
      if (st) st.textContent = "删除失败";
      alert(`删除失败: ${error?.message || error}`);
      finishAnalyzeProgress(false);
    } finally {
      endBackgroundTask(cleanupBgId);
      analyzeTaskState.running = false;
    }
  });

  document.getElementById("analyzePauseBtn")?.addEventListener("click", () => {
    if (!analyzeTaskState.running) return;
    analyzeTaskState.paused = true;
    const st = document.getElementById("analyzeStatus");
    if (st) st.textContent = "任务已暂停";
    if (analyzeProgressText) analyzeProgressText.textContent = "已暂停";
  });
  document.getElementById("analyzeResumeBtn")?.addEventListener("click", () => {
    if (!analyzeTaskState.running && typeof analyzeTaskState.pendingApply !== "function") return;
    analyzeTaskState.paused = false;
    applyAnalyzePending();
    const st = document.getElementById("analyzeStatus");
    if (st) st.textContent = "任务已继续";
    if (analyzeProgress && analyzeProgressText) {
      const v = Number(analyzeProgress.value || 0);
      analyzeProgressText.textContent = `${Math.round(v)}%`;
    }
  });
  document.getElementById("analyzeStopBtn")?.addEventListener("click", () => {
    analyzeTaskState.stopRequested = true;
    analyzeTaskState.pendingApply = null;
    analyzeTaskState.paused = false;
    const st = document.getElementById("analyzeStatus");
    if (st) st.textContent = "已请求停止任务";
    finishAnalyzeProgress(false);
    if (analyzeTaskState.currentTaskId) {
      api.cancelAnalyze(analyzeTaskState.currentTaskId).catch(() => {});
    }
    analyzeTaskState.running = false;
  });

  window.addEventListener("beforeunload", () => {
    if (typeof unbindAnalyzeProgress === "function") unbindAnalyzeProgress();
    if (typeof unbindAnalyzeJunkBatch === "function") unbindAnalyzeJunkBatch();
    if (typeof unbindAnalyzeDuplicateBatch === "function") unbindAnalyzeDuplicateBatch();
  });
}
