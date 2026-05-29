import { formatSizeLabel } from "./cdisk-catalog.js";
import { mountVirtualTableRows } from "./virtual-list.js";

const RISK_LABEL = { safe: "低风险", cautious: "需确认", risky: "高风险" };
const DETAIL_ROW_H = 40;
const DETAIL_VIRTUAL_THRESHOLD = 60;

let modalEl = null;
let detailRenderGen = 0;
/** @type {ReturnType<typeof mountVirtualTableRows> | null} */
let detailVirtualTable = null;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement("div");
  modalEl.id = "cdiskDetailModal";
  modalEl.className = "cdisk-detail-modal";
  modalEl.hidden = true;
  modalEl.innerHTML = `
    <div class="cdisk-detail-backdrop" data-action="close"></div>
    <div class="cdisk-detail-panel" role="dialog" aria-modal="true" aria-labelledby="cdiskDetailTitle">
      <header class="cdisk-detail-header">
        <div class="cdisk-detail-header-text">
          <h3 id="cdiskDetailTitle" class="cdisk-detail-title"></h3>
          <p id="cdiskDetailSubtitle" class="cdisk-detail-subtitle"></p>
        </div>
        <button type="button" class="cdisk-detail-close" data-action="close" aria-label="关闭">×</button>
      </header>
      <div id="cdiskDetailSummary" class="cdisk-detail-summary"></div>
      <div id="cdiskDetailBody" class="cdisk-detail-body"></div>
      <footer class="cdisk-detail-footer">
        <button type="button" class="btn-ghost" data-action="select-all">全选本类</button>
        <button type="button" class="btn-ghost" data-action="select-none">取消全选</button>
        <button type="button" class="btn-primary" data-action="close">关闭</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modalEl);

  modalEl.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "close" || e.target.classList.contains("cdisk-detail-backdrop")) {
      closeCDiskDetail();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl && !modalEl.hidden) {
      closeCDiskDetail();
    }
  });

  return modalEl;
}

function setDetailLoading(modal, { label, sectionTitle }) {
  const title = modal.querySelector("#cdiskDetailTitle");
  const subtitle = modal.querySelector("#cdiskDetailSubtitle");
  const summary = modal.querySelector("#cdiskDetailSummary");
  const body = modal.querySelector("#cdiskDetailBody");
  const footer = modal.querySelector(".cdisk-detail-footer");

  if (title) title.textContent = label;
  if (subtitle) subtitle.textContent = sectionTitle;
  if (summary) {
    summary.innerHTML = `<div class="cdisk-detail-summary-skeleton" aria-hidden="true"></div>`;
  }
  if (body) {
    body.innerHTML = `
      <div class="cdisk-detail-loading" role="status" aria-live="polite">
        <div class="cdisk-detail-spinner" aria-hidden="true"></div>
        <p class="cdisk-detail-loading-text">正在加载详情…</p>
      </div>`;
  }
  footer?.querySelectorAll('[data-action="select-all"], [data-action="select-none"]').forEach((btn) => {
    btn.hidden = true;
    btn.disabled = true;
  });
  const closeBtn = footer?.querySelector('[data-action="close"]');
  if (closeBtn) closeBtn.disabled = false;
  modal.classList.add("cdisk-detail-modal--loading");
  modal.classList.remove("cdisk-detail-modal--ready");
}

function buildRowHtml(item, selectedPaths) {
  const risk = item.riskLevel || "safe";
  const sizeMb =
    typeof item.sizeMB === "number" ? item.sizeMB.toFixed(2) : ((item.size || 0) / (1024 * 1024)).toFixed(2);
  const checked = selectedPaths.has(item.path) ? " checked" : "";
  const path = escapeHtml(item.path);
  const category = escapeHtml(item.category || "—");
  const reason = escapeHtml(item.reason || "—");
  const modifiedAt = escapeHtml(item.modifiedAt || "—");
  return `<tr data-path="${path}">
    <td class="cdisk-detail-check"><input type="checkbox"${checked} aria-label="选择"></td>
    <td class="cdisk-detail-path" title="${path}">${path}</td>
    <td>${sizeMb} MB</td>
    <td><span class="risk-tag risk-tag--${risk}">${RISK_LABEL[risk] || "低风险"}</span></td>
    <td class="cdisk-detail-cat" title="${category}">${category}</td>
    <td class="cdisk-detail-reason" title="${reason}">${reason}</td>
    <td class="cdisk-detail-time">${modifiedAt}</td>
  </tr>`;
}

function yieldToUi() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function dedupeJunks(junks) {
  const uniqueJunks = [];
  const seen = new Set();
  for (const j of junks) {
    if (!j?.path || seen.has(j.path)) continue;
    seen.add(j.path);
    uniqueJunks.push(j);
  }
  uniqueJunks.sort((a, b) => (b.size || 0) - (a.size || 0));
  return uniqueJunks;
}

/**
 * @param {HTMLElement} tbody
 * @param {typeof uniqueJunks} items
 * @param {Set<string>} selectedPaths
 * @param {HTMLElement} scrollRoot
 * @param {number} renderGen
 */
function mountDetailVirtualRows(tbody, items, selectedPaths, scrollRoot, renderGen) {
  detailVirtualTable?.destroy();
  detailVirtualTable = null;

  const virtualRows = items.map((item) => ({
    height: DETAIL_ROW_H,
    render: () => {
      const wrap = document.createElement("tbody");
      wrap.innerHTML = buildRowHtml(item, selectedPaths);
      return wrap.querySelector("tr") ?? document.createElement("tr");
    }
  }));

  detailVirtualTable = mountVirtualTableRows(tbody, scrollRoot, { rows: virtualRows });
  return renderGen === detailRenderGen;
}

/**
 * @param {HTMLElement} tbody
 * @param {typeof uniqueJunks} items
 * @param {Set<string>} selectedPaths
 * @param {number} renderGen
 */
async function appendRowsChunked(tbody, items, selectedPaths, scrollRoot, renderGen) {
  if (items.length >= DETAIL_VIRTUAL_THRESHOLD && scrollRoot) {
    return mountDetailVirtualRows(tbody, items, selectedPaths, scrollRoot, renderGen);
  }
  for (let i = 0; i < items.length; i += 120) {
    if (renderGen !== detailRenderGen) return false;
    const chunk = items.slice(i, i + 120);
    tbody.insertAdjacentHTML("beforeend", chunk.map((item) => buildRowHtml(item, selectedPaths)).join(""));
    if (i + 120 < items.length) {
      await yieldToUi();
    }
  }
  return true;
}

/**
 * @param {{
 *   sectionTitle: string,
 *   label: string,
 *   virtual?: boolean,
 *   sizeBytes: number,
 *   junks: Array<{ path: string, size: number, sizeMB?: number, reason?: string, modifiedAt?: string, riskLevel?: string, category?: string }>,
 *   selectedPaths: Set<string>,
 *   onTogglePath: (path: string, selected: boolean) => void,
 *   onSelectAll: () => void,
 *   onSelectNone: () => void
 * }} opts
 * @param {number} renderGen
 */
async function renderCDiskDetailContent(modal, opts, renderGen) {
  const summary = modal.querySelector("#cdiskDetailSummary");
  const body = modal.querySelector("#cdiskDetailBody");
  const footer = modal.querySelector(".cdisk-detail-footer");

  const uniqueJunks = dedupeJunks(opts.junks);
  const totalBytes = uniqueJunks.reduce((a, x) => a + (x.size || 0), 0);
  const displayBytes = opts.virtual && opts.sizeBytes > 0 ? opts.sizeBytes : totalBytes;

  if (renderGen !== detailRenderGen) return;

  if (summary) {
    if (opts.virtual && uniqueJunks.length === 0) {
      summary.innerHTML = `<p>检测到占用约 <strong>${formatSizeLabel(displayBytes)}</strong>（系统还原点 / 卷影副本空间，非普通文件列表）。</p>
        <p class="cdisk-detail-note">此项通常需在「系统保护」或系统自带的「磁盘清理」中处理，本工具不会直接删除还原点数据。</p>`;
    } else {
      summary.innerHTML = `<p>共 <strong>${uniqueJunks.length}</strong> 个可清理文件，合计 <strong>${formatSizeLabel(displayBytes)}</strong>。</p>`;
    }
  }

  const syncCheckboxes = () => {
    if (!body) return;
    body.querySelectorAll("tbody tr[data-path]").forEach((tr) => {
      const path = tr.dataset.path;
      const cb = tr.querySelector("input[type='checkbox']");
      if (path && cb) cb.checked = opts.selectedPaths.has(path);
    });
  };

  if (body) {
    body.innerHTML = "";
    if (uniqueJunks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cdisk-detail-empty";
      empty.textContent = opts.virtual
        ? "无单独文件路径，请参见上方说明。"
        : "该分类下暂无命中文件，可能目录为空或当前用户无读取权限。";
      body.appendChild(empty);
    } else {
      const tableWrap = document.createElement("div");
      tableWrap.className = "cdisk-detail-table-wrap cdisk-detail-table-wrap--enter";
      const table = document.createElement("table");
      table.className = "cdisk-detail-table";
      table.innerHTML = `<thead><tr>
        <th>选择</th><th>路径</th><th>大小</th><th>风险</th><th>规则分类</th><th>说明</th><th>修改时间</th>
      </tr></thead>`;
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      body.appendChild(tableWrap);

      tbody.addEventListener("change", (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
        const path = input.closest("tr")?.dataset.path;
        if (!path) return;
        opts.onTogglePath(path, input.checked);
        syncCheckboxes();
      });

      const ok = await appendRowsChunked(tbody, uniqueJunks, opts.selectedPaths, tableWrap, renderGen);
      if (!ok || renderGen !== detailRenderGen) return;
    }
  }

  const selectAllBtn = footer?.querySelector('[data-action="select-all"]');
  const selectNoneBtn = footer?.querySelector('[data-action="select-none"]');
  const hasRows = uniqueJunks.length > 0;
  if (selectAllBtn) {
    selectAllBtn.hidden = !hasRows;
    selectAllBtn.disabled = !hasRows;
    selectAllBtn.onclick = () => {
      opts.onSelectAll();
      syncCheckboxes();
    };
  }
  if (selectNoneBtn) {
    selectNoneBtn.hidden = !hasRows;
    selectNoneBtn.disabled = !hasRows;
    selectNoneBtn.onclick = () => {
      opts.onSelectNone();
      syncCheckboxes();
    };
  }

  modal.classList.remove("cdisk-detail-modal--loading");
  modal.classList.add("cdisk-detail-modal--ready");
}

export function closeCDiskDetail() {
  detailRenderGen += 1;
  detailVirtualTable?.destroy();
  detailVirtualTable = null;
  if (modalEl) {
    modalEl.hidden = true;
    modalEl.classList.remove("cdisk-detail-modal--loading", "cdisk-detail-modal--ready");
  }
}

/**
 * @param {{
 *   sectionTitle: string,
 *   label: string,
 *   virtual?: boolean,
 *   sizeBytes: number,
 *   junks: Array<{ path: string, size: number, sizeMB?: number, reason?: string, modifiedAt?: string, riskLevel?: string, category?: string }>,
 *   selectedPaths: Set<string>,
 *   onTogglePath: (path: string, selected: boolean) => void,
 *   onSelectAll: () => void,
 *   onSelectNone: () => void
 * }} opts
 */
export function openCDiskDetail(opts) {
  const modal = ensureModal();
  const renderGen = ++detailRenderGen;

  setDetailLoading(modal, { label: opts.label, sectionTitle: opts.sectionTitle });
  modal.hidden = false;

  void (async () => {
    await yieldToUi();
    if (renderGen !== detailRenderGen) return;
    await renderCDiskDetailContent(modal, opts, renderGen);
  })();
}
