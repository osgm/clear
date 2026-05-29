/**
 * 固定行高虚拟列表（仅渲染可视区域 + overscan）
 * @param {HTMLElement} scrollParent 可滚动容器（需有明确高度或 max-height）
 * @param {{
 *   items: unknown[],
 *   rowHeight?: number,
 *   overscan?: number,
 *   className?: string,
 *   renderRow: (index: number, item: unknown) => HTMLElement,
 *   onRangeChange?: (start: number, end: number) => void
 * }} options
 */
export function mountVirtualList(scrollParent, options) {
  const items = options.items ?? [];
  const rowHeight = options.rowHeight ?? 36;
  const overscan = options.overscan ?? 6;
  const renderRow = options.renderRow;

  scrollParent.classList.add("virtual-list-host");
  if (options.className) {
    scrollParent.classList.add(options.className);
  }

  const inner = document.createElement("div");
  inner.className = "virtual-list-inner";
  inner.style.position = "relative";
  inner.style.minHeight = `${Math.max(0, items.length * rowHeight)}px`;

  const viewport = document.createElement("div");
  viewport.className = "virtual-list-window";
  viewport.style.position = "absolute";
  viewport.style.left = "0";
  viewport.style.right = "0";
  viewport.style.top = "0";
  inner.appendChild(viewport);
  scrollParent.innerHTML = "";
  scrollParent.appendChild(inner);

  let raf = 0;
  let lastStart = -1;
  let lastEnd = -1;

  function paint() {
    raf = 0;
    const scrollTop = scrollParent.scrollTop;
    const viewH = scrollParent.clientHeight || 400;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((scrollTop + viewH) / rowHeight) + overscan);

    if (start === lastStart && end === lastEnd && viewport.childElementCount > 0) {
      return;
    }
    lastStart = start;
    lastEnd = end;

    viewport.style.transform = `translateY(${start * rowHeight}px)`;
    viewport.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) {
      const row = renderRow(i, items[i]);
      if (!(row instanceof HTMLElement)) continue;
      row.style.boxSizing = "border-box";
      row.style.minHeight = `${rowHeight}px`;
      row.dataset.virtualIndex = String(i);
      frag.appendChild(row);
    }
    viewport.appendChild(frag);
    options.onRangeChange?.(start, end);
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(paint);
  }

  scrollParent.addEventListener("scroll", schedule, { passive: true });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  ro?.observe(scrollParent);

  schedule();

  return {
    setItems(nextItems) {
      items.length = 0;
      items.push(...nextItems);
      inner.style.minHeight = `${Math.max(0, items.length * rowHeight)}px`;
      lastStart = -1;
      lastEnd = -1;
      schedule();
    },
    refresh: schedule,
    scrollToIndex(index, behavior = "auto") {
      scrollParent.scrollTo({ top: index * rowHeight, behavior });
      schedule();
    },
    destroy() {
      scrollParent.removeEventListener("scroll", schedule);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      scrollParent.innerHTML = "";
      scrollParent.classList.remove("virtual-list-host");
      if (options.className) scrollParent.classList.remove(options.className);
    }
  };
}

/**
 * 表格 tbody 虚拟滚动（tr 直接挂载，与 thead 列对齐）
 * @param {HTMLTableSectionElement} tbody
 * @param {HTMLElement} scrollRoot
 * @param {{
 *   rows: Array<{ height: number, render: () => HTMLTableRowElement }>,
 *   overscan?: number
 * }} options
 */
export function mountVirtualTableRows(tbody, scrollRoot, options) {
  const rows = options.rows ?? [];
  const overscan = options.overscan ?? 8;

  const offsets = [];
  let total = 0;
  for (const r of rows) {
    offsets.push(total);
    total += r.height;
  }

  const topSpacer = document.createElement("tr");
  topSpacer.className = "virtual-spacer-top";
  const topTd = document.createElement("td");
  topTd.colSpan = 99;
  topTd.style.padding = "0";
  topTd.style.border = "none";
  topSpacer.appendChild(topTd);

  const bottomSpacer = document.createElement("tr");
  bottomSpacer.className = "virtual-spacer-bottom";
  const bottomTd = document.createElement("td");
  bottomTd.colSpan = 99;
  bottomTd.style.padding = "0";
  bottomTd.style.border = "none";
  bottomSpacer.appendChild(bottomTd);

  tbody.innerHTML = "";
  tbody.appendChild(topSpacer);
  tbody.appendChild(bottomSpacer);

  let raf = 0;
  let lastStart = -1;
  let lastEnd = -1;

  function findIndex(scrollTop) {
    if (offsets.length === 0) return 0;
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (offsets[mid] <= scrollTop) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  function paint() {
    raf = 0;
    if (rows.length === 0) {
      topTd.style.height = "0px";
      bottomTd.style.height = "0px";
      tbody.querySelectorAll("tr.virtual-data-row").forEach((tr) => tr.remove());
      return;
    }

    const scrollTop = scrollRoot.scrollTop;
    const viewH = scrollRoot.clientHeight || 400;
    const start = Math.max(0, findIndex(scrollTop) - overscan);
    let end = start;
    let y = offsets[start] ?? 0;
    while (end < rows.length && y < scrollTop + viewH) {
      y += rows[end].height;
      end += 1;
    }
    end = Math.min(rows.length, end + overscan);

    if (start === lastStart && end === lastEnd && tbody.querySelectorAll("tr.virtual-data-row").length > 0) {
      return;
    }
    lastStart = start;
    lastEnd = end;

    topTd.style.height = `${offsets[start] ?? 0}px`;
    const bottomOffset = total - (offsets[end] ?? total);
    bottomTd.style.height = `${Math.max(0, bottomOffset)}px`;

    tbody.querySelectorAll("tr.virtual-data-row").forEach((tr) => tr.remove());
    for (let i = start; i < end; i += 1) {
      const tr = rows[i].render();
      tr.classList.add("virtual-data-row");
      tbody.insertBefore(tr, bottomSpacer);
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(paint);
  }

  scrollRoot.addEventListener("scroll", schedule, { passive: true });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  ro?.observe(scrollRoot);
  schedule();

  return {
    setRows(nextRows) {
      rows.length = 0;
      rows.push(...nextRows);
      offsets.length = 0;
      total = 0;
      for (const r of rows) {
        offsets.push(total);
        total += r.height;
      }
      lastStart = -1;
      lastEnd = -1;
      schedule();
    },
    scrollToIndex(index, behavior = "auto") {
      scrollRoot.scrollTo({ top: offsets[index] ?? 0, behavior });
      schedule();
    },
    refresh: schedule,
    destroy() {
      scrollRoot.removeEventListener("scroll", schedule);
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      tbody.innerHTML = "";
    }
  };
}
