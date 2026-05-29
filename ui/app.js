/** @typedef {{path: string,size: number,sizeMB: number,reason: string,modifiedAt: string,category?: string}} JunkFile */
import { initAnalyzeModule } from "./modules/analyze.js";
import {
  listBackgroundTasks,
  subscribeBackgroundTasks
} from "./modules/background-tasks.js";
import { initCDiskModule } from "./modules/cdisk.js";
import { initPrivacyModule } from "./modules/privacy.js";
import { appBrandSvg, heroAnalyzeSvg, heroDiskSvg, heroPrivacyBadgeSvg } from "./modules/ui-icons.js";

const api = window.cleanerApi;

(function mountSharedIcons() {
  const brandIcon = document.querySelector(".brand-icon");
  const diskSlot = document.querySelector("#panel-cdisk .hero-icon-slot");
  const analyzeSlot = document.querySelector("#panel-analyze .hero-icon-slot");
  if (brandIcon) brandIcon.innerHTML = appBrandSvg;
  if (diskSlot) diskSlot.innerHTML = heroDiskSvg;
  if (analyzeSlot) analyzeSlot.innerHTML = heroAnalyzeSvg;

  const navMap = [
    ['[data-panel="panel-cdisk"] .nav-lead-icon', heroDiskSvg],
    ['[data-panel="panel-analyze"] .nav-lead-icon', heroAnalyzeSvg],
    ['[data-panel="panel-privacy"] .nav-lead-icon', heroPrivacyBadgeSvg]
  ];
  for (const [sel, svg] of navMap) {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = svg;
  }

  const emptyPrivacy = document.querySelector("#privacyEmpty .privacy-empty-icon");
  if (emptyPrivacy) emptyPrivacy.innerHTML = heroPrivacyBadgeSvg;
})();

const state = {
  scannedJunks: /** @type {JunkFile[]} */ ([]),
  selectedPaths: new Set(),
  queuedCleanupPaths: new Set(),
  cleanedPaths: new Set(),
  queueRunning: false,
  privacyItems: [],
  selectedPrivacy: new Set(),
  lastScanPayload: null,
  lastCleanupResult: null,
  lastMode: "c-disk",
  /** @type {"duplicates"|"bigfiles"|"empty-files"|"empty-dirs"} */
  analyzeTool: "duplicates",
  /** @type {{ hash: string; size: number; files: JunkFile[] }[]} */
  duplicateGroups: [],
  /** @type {JunkFile[]} */
  analyzeItems: [],
  selectedAnalyzePaths: new Set(),
  collapsedDuplicateGroups: new Set(),
  queueRequested: 0,
  queueProcessed: 0,
  queueSucceeded: 0,
  queueFailed: 0
};

const navItems = document.querySelectorAll(".nav-item");
const panels = document.querySelectorAll(".panel");
const statusText = document.getElementById("status");
const summaryText = document.getElementById("summaryText");
const privacyEmpty = document.getElementById("privacyEmpty");
const privacyResults = document.getElementById("privacyResults");

function getCleanupMode() {
  const el = document.getElementById("cleanupMode");
  return el && el.value === "shred" ? "shred" : "recycle";
}

// 磁盘分析模块已迁移到 ui/modules/analyze.js
const scanProgress = document.getElementById("scanProgress");
const progressText = document.getElementById("progressText");
const cancelScanBtn = document.getElementById("cancelScanBtn");
const pauseScanBtn = document.getElementById("pauseScanBtn");
const resumeScanBtn = document.getElementById("resumeScanBtn");
const scanBtn = document.getElementById("scanBtn");
function setStatus(text) {
  statusText.textContent = text;
}

function switchPanel(panelId) {
  if (!panelId) return;
  navItems.forEach((x) => x.classList.toggle("active", x.dataset.panel === panelId));
  panels.forEach((x) => x.classList.toggle("active", x.id === panelId));
}

function renderSidebarBackgroundTasks() {
  const dock = document.getElementById("sidebarTaskDock");
  const listEl = document.getElementById("sidebarTaskList");
  const tasks = listBackgroundTasks();
  const busyPanels = new Set(tasks.map((t) => t.panelId));

  navItems.forEach((nav) => {
    const panelId = nav.dataset.panel;
    const dot = nav.querySelector(".nav-busy-dot");
    if (dot) dot.hidden = !busyPanels.has(panelId);
  });

  if (!dock || !listEl) return;
  if (tasks.length === 0) {
    dock.hidden = true;
    listEl.innerHTML = "";
    return;
  }
  dock.hidden = false;
  listEl.innerHTML = "";
  for (const task of tasks) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-task-item";
    const pct =
      typeof task.percent === "number" && task.percent > 0
        ? ` · ${Math.round(task.percent)}%`
        : "";
    const detail = task.detail ? ` · ${task.detail}` : "";
    btn.textContent = `${task.label}${pct}${detail}`;
    btn.addEventListener("click", () => switchPanel(task.panelId));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

subscribeBackgroundTasks(renderSidebarBackgroundTasks);
renderSidebarBackgroundTasks();
async function pickToInput(inputId) {
  const picked = await api.chooseDirectory();
  if (picked) document.getElementById(inputId).value = picked;
}
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    // 仅切换可见面板，不取消其它面板正在运行的扫描/分析任务
    switchPanel(item.dataset.panel);
  });
});

initCDiskModule({
  api,
  state,
  setStatus,
  getCleanupMode,
  pickToInput,
  scanProgress,
  progressText,
  cancelScanBtn,
  pauseScanBtn,
  resumeScanBtn,
  scanBtn,
  summaryText
});
initPrivacyModule({
  api,
  state,
  setStatus,
  getCleanupMode,
  privacyEmpty,
  privacyResults
});

initAnalyzeModule({ api, state, getCleanupMode });
