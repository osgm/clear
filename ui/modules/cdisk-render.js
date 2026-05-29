import { buildCategoryAggregates, CDISK_SECTIONS, formatSizeLabel } from "./cdisk-catalog.js";
import { getCDiskIconSvg } from "./ui-icons.js";

const RISK_RANK = { safe: 0, cautious: 1, risky: 2 };

/**
 * @param {Set<string>} selectedPaths
 * @param {string[]} paths
 */
function pathsAllSelected(selectedPaths, paths) {
  return paths.length > 0 && paths.every((p) => selectedPaths.has(p));
}

/**
 * @param {Set<string>} selectedPaths
 * @param {string[]} paths
 */
function pathsSomeSelected(selectedPaths, paths) {
  return paths.some((p) => selectedPaths.has(p));
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   state: { scannedJunks: any[], selectedPaths: Set<string>, ignoredCategoryKeys?: Set<string>, lastScanPayload?: any },
 *   onToggleCategory: (key: string, paths: string[], selected: boolean) => void,
 *   onIgnoreCategory?: (key: string) => void,
 *   onViewDetail?: (payload: { sectionTitle: string, label: string, key: string, virtual?: boolean, sizeBytes: number, junks: any[] }) => void,
 *   onSectionSelectAll?: (items: Array<{ key: string, paths: string[] }>, selected: boolean) => void
 * }} opts
 */
export function renderCDiskResults(container, {
  state,
  onToggleCategory,
  onIgnoreCategory,
  onViewDetail,
  onSectionSelectAll
}) {
  if (!container) return;
  container.innerHTML = "";

  const junks = state.scannedJunks || [];
  const restorePointBytes = state.lastScanPayload?.scanResult?.restorePointBytes;
  const categoryStats = state.lastScanPayload?.scanResult?.categoryStats;
  const hasScan = Boolean(state.lastScanPayload) || junks.length > 0;

  if (!hasScan) {
    const empty = document.createElement("div");
    empty.className = "cdisk-results-empty";
    empty.textContent = "选择盘符后点击「开始扫描」，结果将按分类展示";
    container.appendChild(empty);
    return;
  }

  for (const section of CDISK_SECTIONS) {
    const aggMap = buildCategoryAggregates(section.items, junks, restorePointBytes, categoryStats);
    const block = document.createElement("section");
    block.className = "cdisk-block";
    block.dataset.section = section.id;

    const head = document.createElement("header");
    head.className = "cdisk-block-head";
    const icon = document.createElement("span");
    icon.className = `cdisk-block-icon cdisk-block-icon--${section.icon}`;
    icon.innerHTML = getCDiskIconSvg(section.icon);
    head.appendChild(icon);
    const titles = document.createElement("div");
    titles.className = "cdisk-block-titles";
    const h = document.createElement("h3");
    h.className = "cdisk-block-title";

    const sectionSelectable = section.items
      .map((def) => {
        const agg = aggMap.get(def.key) || { sizeBytes: 0, paths: [], junks: [] };
        const ignored = state.ignoredCategoryKeys?.has(def.key);
        const canSelect = !ignored && !def.virtual && agg.paths.length > 0 && agg.sizeBytes > 0;
        return canSelect ? { key: def.key, paths: agg.paths } : null;
      })
      .filter(Boolean);

    const allSectionPaths = sectionSelectable.flatMap((x) => x.paths);
    const selectedInSection = allSectionPaths.filter((p) => state.selectedPaths.has(p)).length;

    if (onSectionSelectAll) {
      const groupLabel = document.createElement("label");
      groupLabel.className = "cdisk-group-check";
      groupLabel.title = `全选/取消${section.title}`;
      const groupCb = document.createElement("input");
      groupCb.type = "checkbox";
      groupCb.checked = allSectionPaths.length > 0 && selectedInSection === allSectionPaths.length;
      groupCb.indeterminate = selectedInSection > 0 && selectedInSection < allSectionPaths.length;
      groupCb.disabled = allSectionPaths.length === 0;
      groupLabel.appendChild(groupCb);
      groupLabel.appendChild(document.createTextNode("全选"));
      groupCb.addEventListener("change", () => {
        onSectionSelectAll(sectionSelectable, groupCb.checked);
      });
      h.appendChild(groupLabel);
    }

    const titleText = document.createElement("span");
    titleText.textContent = section.title;
    h.appendChild(titleText);
    titles.appendChild(h);
    const sub = document.createElement("p");
    sub.className = "cdisk-block-sub";
    sub.textContent = section.subtitle;
    titles.appendChild(sub);
    head.appendChild(titles);
    const rule = document.createElement("span");
    rule.className = "cdisk-block-rule";
    rule.setAttribute("aria-hidden", "true");
    head.appendChild(rule);
    block.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "cdisk-grid";
    grid.style.setProperty("--cdisk-cols", String(section.columns));

    for (const def of section.items) {
      const agg = aggMap.get(def.key) || { sizeBytes: 0, paths: [], junks: [], maxRisk: def.defaultRisk || "safe" };
      const ignored = state.ignoredCategoryKeys?.has(def.key);
      const sizeBytes = ignored ? 0 : agg.sizeBytes;
      const paths = ignored ? [] : agg.paths;
      const canSelect = sizeBytes > 0 && paths.length > 0 && !def.virtual;
      const selected = canSelect && pathsAllSelected(state.selectedPaths, paths);
      const partial = canSelect && !selected && pathsSomeSelected(state.selectedPaths, paths);

      const hasDetail = Boolean(onViewDetail);

      const tile = document.createElement("div");
      tile.className =
        "cdisk-tile" +
        (ignored ? " cdisk-tile--ignored" : "") +
        (canSelect ? " cdisk-tile--selectable" : "") +
        (hasDetail ? " cdisk-tile--has-detail" : "");
      tile.dataset.key = def.key;
      if (hasDetail || canSelect) tile.tabIndex = 0;

      const iconWrap = document.createElement("div");
      iconWrap.className = "cdisk-tile-icon";
      iconWrap.innerHTML = getCDiskIconSvg(def.key);
      if (canSelect) {
        const mark = document.createElement("span");
        mark.className = "cdisk-tile-check" + (selected ? " cdisk-tile-check--on" : partial ? " cdisk-tile-check--partial" : "");
        mark.setAttribute("aria-hidden", "true");
        mark.addEventListener("click", (e) => {
          e.stopPropagation();
          const next = !pathsAllSelected(state.selectedPaths, paths);
          onToggleCategory(def.key, paths, next);
        });
        iconWrap.appendChild(mark);
      }
      tile.appendChild(iconWrap);

      const name = document.createElement("div");
      name.className = "cdisk-tile-name";
      name.textContent = def.label;
      tile.appendChild(name);

      const badge = document.createElement("span");
      badge.className =
        sizeBytes > 0 ? "cdisk-badge cdisk-badge--warn" : "cdisk-badge cdisk-badge--clean";
      badge.textContent = formatSizeLabel(sizeBytes);
      tile.appendChild(badge);

      if (canSelect && RISK_RANK[agg.maxRisk] > RISK_RANK.safe) {
        const hint = document.createElement("span");
        hint.className = "cdisk-tile-risk";
        hint.textContent = agg.maxRisk === "risky" ? "需谨慎" : "需确认";
        tile.appendChild(hint);
      }

      if (sizeBytes > 0 && !canSelect && def.virtual) {
        const hint = document.createElement("span");
        hint.className = "cdisk-tile-risk";
        hint.textContent = "仅检测";
        tile.appendChild(hint);
      }

      const actions = document.createElement("div");
      actions.className = "cdisk-tile-actions";
      if (hasDetail && onViewDetail) {
        const detailBtn = document.createElement("button");
        detailBtn.type = "button";
        detailBtn.className = "cdisk-detail-link";
        detailBtn.textContent = "查看详情";
        detailBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          onViewDetail({
            sectionTitle: section.title,
            label: def.label,
            key: def.key,
            virtual: def.virtual,
            sizeBytes,
            junks: agg.junks
          });
        });
        actions.appendChild(detailBtn);
      }
      if (canSelect && onIgnoreCategory) {
        const ignoreBtn = document.createElement("button");
        ignoreBtn.type = "button";
        ignoreBtn.className = "cdisk-ignore-link";
        ignoreBtn.textContent = "忽略";
        ignoreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          onIgnoreCategory(def.key);
        });
        actions.appendChild(ignoreBtn);
      }
      tile.appendChild(actions);

      if (hasDetail && onViewDetail) {
        const openDetail = () => {
          onViewDetail({
            sectionTitle: section.title,
            label: def.label,
            key: def.key,
            virtual: def.virtual,
            sizeBytes,
            junks: agg.junks
          });
        };
        tile.addEventListener("click", (e) => {
          if (e.target.closest(".cdisk-ignore-link, .cdisk-detail-link, .cdisk-tile-check")) return;
          openDetail();
        });
        tile.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            openDetail();
          }
        });
      }

      grid.appendChild(tile);
    }

    block.appendChild(grid);
    container.appendChild(block);
  }
}
