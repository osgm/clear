import { endBackgroundTask, startBackgroundTask } from "./background-tasks.js";
import { PRIVACY_HIDDEN_IDS, PRIVACY_SECTIONS } from "./privacy-catalog.js";

const PRIVACY_BG_SCAN = "privacy-scan";
const PRIVACY_BG_CLEANUP = "privacy-cleanup";
import { getPrivacyIconSvg, getPrivacySectionIconSvg } from "./ui-icons.js";

export function initPrivacyModule({ api, state, setStatus, getCleanupMode, privacyEmpty, privacyResults }) {
  const privacyTaskState = {
    running: false,
    paused: false,
    stopRequested: false,
    pendingApply: null
  };
  const groupCheckboxBySection = new Map();

  function iconClassForId(id) {
    const map = {
      "privacy-chrome": "chrome",
      "privacy-edge": "edge",
      "privacy-firefox": "firefox",
      "recent-files": "recent",
      "app-activity": "app",
      "search-history": "search",
      "typed-paths": "typed",
      "run-command": "run",
      "registry-mru": "registry",
      "taskbar-jump": "jump",
      clipboard: "clipboard",
      "inet-cache": "ie",
      "privacy-notepadpp": "notepadpp",
      "privacy-msoffice": "msoffice"
    };
    return map[id] || "generic";
  }

  function visiblePrivacyItems() {
    return state.privacyItems.filter((x) => !PRIVACY_HIDDEN_IDS.includes(x.id));
  }

  function updatePrivacyStats() {
    const totalEl = document.getElementById("privacyTotalTraces");
    const selEl = document.getElementById("privacySelectedTraces");
    if (!totalEl || !selEl) return;
    const items = visiblePrivacyItems();
    const total = items.reduce((a, x) => a + (x.fileCount || 0), 0);
    const selected = items
      .filter((x) => state.selectedPrivacy.has(x.id))
      .reduce((a, x) => a + (x.fileCount || 0), 0);
    totalEl.textContent = String(total);
    selEl.textContent = String(selected);
  }

  function updateGroupSelectState() {
    const byId = Object.fromEntries(state.privacyItems.map((x) => [x.id, x]));
    for (const section of PRIVACY_SECTIONS) {
      const cb = groupCheckboxBySection.get(section.id);
      if (!cb) continue;
      const ids = section.order.filter((id) => byId[id]);
      const selectedCount = ids.filter((id) => state.selectedPrivacy.has(id)).length;
      cb.checked = ids.length > 0 && selectedCount === ids.length;
      cb.indeterminate = selectedCount > 0 && selectedCount < ids.length;
      cb.disabled = ids.length === 0;
    }
  }

  function createPrivacyCard(item) {
    const hasTraces = (item.fileCount || 0) > 0;
    const card = document.createElement("div");
    card.className = "privacy-card" + (hasTraces ? "" : " privacy-card--zero");
    card.dataset.id = item.id;

    const iconWrap = document.createElement("div");
    iconWrap.className = "privacy-icon-wrap";
    const icon = document.createElement("div");
    const iconKind = iconClassForId(item.id);
    icon.className = `privacy-icon privacy-icon--${iconKind}`;
    icon.innerHTML = getPrivacyIconSvg(iconKind);
    iconWrap.appendChild(icon);

    const label = document.createElement("label");
    label.className = "privacy-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.id = item.id;
    input.checked = state.selectedPrivacy.has(item.id);
    label.appendChild(input);
    iconWrap.appendChild(label);
    card.appendChild(iconWrap);

    const name = document.createElement("div");
    name.className = "privacy-card-name";
    name.textContent = item.name;
    card.appendChild(name);

    const badge = document.createElement("span");
    badge.className = hasTraces ? "privacy-badge privacy-badge--warn" : "privacy-badge privacy-badge--clean";
    badge.textContent = `${item.fileCount || 0}条`;
    card.appendChild(badge);

    return card;
  }

  function renderPrivacyDashboard() {
    if (!privacyResults || !privacyEmpty) return;
    if (state.privacyItems.length === 0) {
      privacyEmpty.hidden = false;
      privacyResults.hidden = true;
      privacyResults.innerHTML = "";
      updatePrivacyStats();
      return;
    }
    privacyEmpty.hidden = true;
    privacyResults.hidden = false;
    privacyResults.innerHTML = "";
    groupCheckboxBySection.clear();

    const byId = Object.fromEntries(state.privacyItems.map((x) => [x.id, x]));

    for (const section of PRIVACY_SECTIONS) {
      const block = document.createElement("section");
      block.className = "privacy-block";
      block.dataset.section = section.id;

      const head = document.createElement("header");
      head.className = "privacy-block-head";

      const icon = document.createElement("span");
      icon.className = `privacy-block-icon privacy-block-icon--${section.icon}`;
      icon.innerHTML = getPrivacySectionIconSvg(section.icon);
      head.appendChild(icon);

      const titles = document.createElement("div");
      titles.className = "privacy-block-titles";
      const titleRow = document.createElement("h3");
      titleRow.className = "privacy-block-title";
      titleRow.id = `privacy-title-${section.id}`;

      const groupLabel = document.createElement("label");
      groupLabel.className = "privacy-group-check";
      groupLabel.title = `全选/取消${section.title}`;
      const groupCb = document.createElement("input");
      groupCb.type = "checkbox";
      groupCb.checked = true;
      groupLabel.appendChild(groupCb);
      groupLabel.appendChild(document.createTextNode("全选"));
      groupCheckboxBySection.set(section.id, groupCb);

      groupCb.addEventListener("change", () => {
        const ids = section.order.filter((id) => byId[id]);
        ids.forEach((id) => {
          const item = byId[id];
          if (!item) return;
          if (groupCb.checked) state.selectedPrivacy.add(id);
          else state.selectedPrivacy.delete(id);
        });
        renderPrivacyDashboard();
      });

      titleRow.appendChild(groupLabel);
      const titleText = document.createElement("span");
      titleText.textContent = `${section.title}${section.subtitle}`;
      titleRow.appendChild(titleText);
      titles.appendChild(titleRow);
      head.appendChild(titles);

      const rule = document.createElement("span");
      rule.className = "privacy-block-rule";
      rule.setAttribute("aria-hidden", "true");
      head.appendChild(rule);
      block.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "privacy-grid";
      grid.style.setProperty("--privacy-cols", String(section.columns));

      section.order.forEach((id) => {
        const item = byId[id];
        if (item) grid.appendChild(createPrivacyCard(item));
      });

      block.appendChild(grid);
      privacyResults.appendChild(block);
    }

    updatePrivacyStats();
    updateGroupSelectState();
  }

  function defaultSelectPrivacy() {
    state.selectedPrivacy.clear();
    visiblePrivacyItems().forEach((x) => {
      if ((x.fileCount || 0) > 0) state.selectedPrivacy.add(x.id);
    });
    updateGroupSelectState();
  }

  function applyPrivacyPending() {
    if (typeof privacyTaskState.pendingApply === "function") {
      const fn = privacyTaskState.pendingApply;
      privacyTaskState.pendingApply = null;
      fn();
    }
  }

  function collectRelatedProcessHints(categories) {
    const idToProcesses = {
      "privacy-chrome": ["chrome.exe"],
      "privacy-edge": ["msedge.exe"],
      "privacy-firefox": ["firefox.exe"],
      "inet-cache": ["iexplore.exe", "msedge.exe"],
      "privacy-msoffice": ["WINWORD.EXE", "EXCEL.EXE", "POWERPNT.EXE"],
      "privacy-notepadpp": ["notepad++.exe"]
    };
    const out = new Set();
    categories.forEach((item) => {
      const names = idToProcesses[item.id] || [];
      names.forEach((n) => out.add(n));
    });
    return Array.from(out);
  }

  document.getElementById("privacyScanBtn").addEventListener("click", async () => {
    if (privacyTaskState.running) return;
    if (privacyTaskState.paused) {
      setStatus("隐私任务已暂停，点击继续任务");
      return;
    }
    privacyTaskState.running = true;
    privacyTaskState.stopRequested = false;
    setStatus("隐私扫描中...");
    startBackgroundTask(PRIVACY_BG_SCAN, {
      panelId: "panel-privacy",
      label: "隐私扫描"
    });
    try {
      const items = await api.scanPrivacy();
      if (privacyTaskState.stopRequested) {
        setStatus("隐私任务已停止");
        return;
      }
      const apply = () => {
        state.privacyItems = items;
        defaultSelectPrivacy();
        renderPrivacyDashboard();
        setStatus("隐私扫描完成");
      };
      if (privacyTaskState.paused) {
        privacyTaskState.pendingApply = apply;
        setStatus("隐私任务已暂停，点击继续任务");
      } else {
        apply();
      }
    } catch (error) {
      setStatus("隐私扫描失败");
      alert(`扫描失败: ${error?.message || error}`);
    } finally {
      endBackgroundTask(PRIVACY_BG_SCAN);
      privacyTaskState.running = false;
    }
  });

  if (privacyResults) {
    privacyResults.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      const id = target.dataset.id;
      if (!id) return;
      target.checked ? state.selectedPrivacy.add(id) : state.selectedPrivacy.delete(id);
      updatePrivacyStats();
      updateGroupSelectState();
    });
    privacyResults.addEventListener("click", (event) => {
      const card = event.target.closest(".privacy-card");
      if (!card) return;
      if (event.target.closest(".privacy-check") || event.target.closest(".privacy-group-check")) return;
      const cb = card.querySelector('input[type="checkbox"][data-id]');
      if (!cb) return;
      cb.checked = !cb.checked;
      const id = cb.dataset.id;
      if (!id) return;
      cb.checked ? state.selectedPrivacy.add(id) : state.selectedPrivacy.delete(id);
      updatePrivacyStats();
      updateGroupSelectState();
    });
  }

  document.getElementById("privacyCleanupBtn").addEventListener("click", async () => {
    if (privacyTaskState.running) return;
    if (privacyTaskState.paused) {
      setStatus("隐私任务已暂停，点击继续任务");
      return;
    }
    const targets = visiblePrivacyItems().filter((x) => state.selectedPrivacy.has(x.id));
    if (targets.length === 0) return alert("请先勾选要清理的项");
    const traceCount = targets.reduce((a, x) => a + (x.fileCount || 0), 0);
    const mode = getCleanupMode();
    const processHints = collectRelatedProcessHints(targets);
    if (processHints.length > 0) {
      const processMsg = `检测到你勾选了相关软件隐私项，建议先关闭以下进程后再清理，以避免文件占用导致清理不完整：\n${processHints.join(
        "\n"
      )}\n\n是否继续？`;
      if (!confirm(processMsg)) return;
    }
    const msg =
      mode === "shred"
        ? `将对已选隐私项执行安全删除（覆写目录/文件，不可恢复），约 ${traceCount} 条计数，是否继续？`
        : `将清理已选中的隐私痕迹（约 ${traceCount} 条文件计数），移入回收站，是否继续？`;
    if (!confirm(msg)) return;
    privacyTaskState.running = true;
    privacyTaskState.stopRequested = false;
    setStatus("隐私清理中...");
    startBackgroundTask(PRIVACY_BG_CLEANUP, {
      panelId: "panel-privacy",
      label: "隐私清理",
      detail: `${targets.length} 项`
    });
    try {
      const result = await api.cleanupPrivacy(targets, mode);
      if (privacyTaskState.stopRequested) {
        setStatus("隐私任务已停止");
        return;
      }
      alert(`隐私清理完成：成功 ${result.deletedCount} 条计数，失败 ${result.failedCount} 项`);
      const refreshed = await api.scanPrivacy();
      const apply = () => {
        state.privacyItems = refreshed;
        defaultSelectPrivacy();
        renderPrivacyDashboard();
        setStatus("隐私清理完成");
      };
      if (privacyTaskState.paused) {
        privacyTaskState.pendingApply = apply;
        setStatus("隐私任务已暂停，点击继续任务");
      } else {
        apply();
      }
    } catch (error) {
      setStatus("隐私清理失败");
      alert(`清理失败: ${error?.message || error}`);
    } finally {
      endBackgroundTask(PRIVACY_BG_CLEANUP);
      privacyTaskState.running = false;
    }
  });

  document.getElementById("privacyPauseBtn")?.addEventListener("click", () => {
    privacyTaskState.paused = true;
    setStatus("隐私任务已暂停");
  });
  document.getElementById("privacyResumeBtn")?.addEventListener("click", () => {
    privacyTaskState.paused = false;
    applyPrivacyPending();
    setStatus("隐私任务已继续");
  });
  document.getElementById("privacyStopBtn")?.addEventListener("click", () => {
    privacyTaskState.stopRequested = true;
    privacyTaskState.pendingApply = null;
    privacyTaskState.paused = false;
    setStatus("已请求停止隐私任务");
  });

  updatePrivacyStats();
}
