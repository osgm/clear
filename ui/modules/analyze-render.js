import { mountVirtualTableRows } from "./virtual-list.js";

const GROUP_ROW_H = 44;
const FILE_ROW_H = 36;
const VIRTUAL_THRESHOLD = 80;

export function createAnalyzeRenderer(state) {
  let analyzeRenderToken = 0;
  let pendingAnalyzeScrollGroupId = "";
  /** @type {ReturnType<typeof mountVirtualTableRows> | null} */
  let virtualTable = null;

  function duplicateGroupId(group) {
    return group._dupKey || `${group.hash}:${group.size}`;
  }

  function getDuplicateGroupById(groupId) {
    return state.duplicateGroups.find((g) => duplicateGroupId(g) === groupId) || null;
  }

  function getSelectedAnalyzeTargets() {
    const out = [];
    state.duplicateGroups.forEach((g) => {
      g.files.forEach((f) => {
        if (state.selectedAnalyzePaths.has(f.path)) out.push(f);
      });
    });
    state.analyzeItems.forEach((f) => {
      if (state.selectedAnalyzePaths.has(f.path)) out.push(f);
    });
    return out;
  }

  function setPendingScrollGroupId(groupId) {
    pendingAnalyzeScrollGroupId = groupId;
  }

  function buildFlatRows() {
    const rows = [];
    if (state.duplicateGroups.length > 0) {
      state.duplicateGroups.forEach((g, gi) => {
        const groupId = duplicateGroupId(g);
        const collapsed = state.collapsedDuplicateGroups.has(groupId);
        const totalMB = g.files.reduce((acc, file) => acc + (file.sizeMB || 0), 0);
        const selectedCount = g.files.reduce(
          (acc, file) => acc + (state.selectedAnalyzePaths.has(file.path) ? 1 : 0),
          0
        );
        const drivePrefix = g._driveLabel ? `${g._driveLabel} · ` : "";
        rows.push({
          type: "group",
          groupId,
          group: `${drivePrefix}重复组 ${gi + 1}`,
          count: g.files.length,
          selectedCount,
          totalMB,
          collapsed
        });
        if (collapsed) return;
        g.files.forEach((f) => {
          rows.push({
            type: "file",
            path: f.path,
            sizeMB: f.sizeMB,
            reason: f.reason,
            group: `${drivePrefix}重复组 ${gi + 1}（${g.files.length}）`,
            checked: state.selectedAnalyzePaths.has(f.path)
          });
        });
      });
    }
    state.analyzeItems.forEach((f) => {
      rows.push({
        type: "file",
        path: f.path,
        sizeMB: f.sizeMB,
        reason: f.reason,
        group: f.reason?.split("·")[0]?.trim() || "分析结果",
        checked: state.selectedAnalyzePaths.has(f.path)
      });
    });
    return rows;
  }

  function renderGroupRow(row) {
    const tr = document.createElement("tr");
    tr.dataset.groupId = row.groupId;
    const td = document.createElement("td");
    td.colSpan = 5;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.groupToggle = row.groupId;
    btn.className = "btn-ghost";
    btn.textContent = `${row.collapsed ? "展开" : "折叠"} ${row.group}（${row.count} 项，已选 ${row.selectedCount}，${row.totalMB.toFixed(2)} MB）`;
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.dataset.groupSelect = row.groupId;
    selectBtn.className = "btn-ghost";
    selectBtn.textContent = row.selectedCount === row.count ? "取消本组" : "本组全选";
    td.append(btn, selectBtn);
    tr.appendChild(td);
    return tr;
  }

  function renderFileRow(row) {
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.dataset.path = row.path;
    inp.checked = row.checked;
    td0.appendChild(inp);
    const td1 = document.createElement("td");
    td1.textContent = row.group;
    const td2 = document.createElement("td");
    td2.className = "path";
    td2.textContent = row.path;
    const td3 = document.createElement("td");
    td3.textContent = (row.sizeMB ?? 0).toFixed(2);
    const td4 = document.createElement("td");
    td4.textContent = row.reason;
    tr.append(td0, td1, td2, td3, td4);
    return tr;
  }

  function renderAnalyzeTable() {
    const body = document.getElementById("analyzeBody");
    if (!body) return;
    analyzeRenderToken += 1;
    const token = analyzeRenderToken;
    const scrollRoot = body.closest(".table-wrap");
    if (!(scrollRoot instanceof HTMLElement)) return;

    virtualTable?.destroy();
    virtualTable = null;

    const flatRows = buildFlatRows();
    body.innerHTML = "";

    if (flatRows.length === 0) return;

    const useVirtual = flatRows.length >= VIRTUAL_THRESHOLD;

    if (!useVirtual) {
      const frag = document.createDocumentFragment();
      for (const row of flatRows) {
        frag.appendChild(row.type === "group" ? renderGroupRow(row) : renderFileRow(row));
      }
      body.appendChild(frag);
      if (pendingAnalyzeScrollGroupId) {
        const target = body.querySelector(`tr[data-group-id="${pendingAnalyzeScrollGroupId}"]`);
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          pendingAnalyzeScrollGroupId = "";
        }
      }
      return;
    }

    const virtualRows = flatRows.map((row) => ({
      height: row.type === "group" ? GROUP_ROW_H : FILE_ROW_H,
      render: () => (row.type === "group" ? renderGroupRow(row) : renderFileRow(row))
    }));

    virtualTable = mountVirtualTableRows(body, scrollRoot, { rows: virtualRows });

    if (pendingAnalyzeScrollGroupId) {
      const idx = flatRows.findIndex((r) => r.type === "group" && r.groupId === pendingAnalyzeScrollGroupId);
      if (idx >= 0) {
        virtualTable.scrollToIndex(idx, "smooth");
      }
      pendingAnalyzeScrollGroupId = "";
    }

    if (token !== analyzeRenderToken) {
      virtualTable.destroy();
      virtualTable = null;
    }
  }

  return {
    duplicateGroupId,
    getDuplicateGroupById,
    getSelectedAnalyzeTargets,
    setPendingScrollGroupId,
    renderAnalyzeTable
  };
}
